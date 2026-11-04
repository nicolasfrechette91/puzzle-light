import type { Board } from '../core/board';
import type { Hint } from '../core/hint';
import { rgba, type Color } from '../core/color';
import { canMove, canRotate, KINDS, rotDegrees, type Piece } from '../core/piece';
import { arrivals, segments, type Segment, type Trace } from '../core/trace';
import type { Drag, Preview } from './input';
import { LONG_PRESS_MS } from './input';
import type { Layout } from './layout';

/** What the renderer needs from the game (Game satisfies it; so does the editor). */
export interface GameView {
  board: Board;
  trace: Trace;
  solved: boolean;
  hintShown: Hint | null;
}

/** What the renderer needs from input handling (Input satisfies it; so does the editor). */
export interface InputView {
  preview: Preview | null;
  drag: Drag | null;
  hoverCell: number;
  hoverSlot: number;
  selectedSlot: number;
  pressStart: { cell: number; t0: number } | null;
}

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
  /** Seconds, for gentle animation. */
  time: number;
  /** Colour arriving at a target. */
  got?: Color;
  ok?: boolean;
  /** Colour entering the cell (lights up optics). */
  lit?: Color;
  /** Colour absorbed in the cell (tints black holes). */
  hit?: Color;
  alpha?: number;
  /** Drawn as a tray icon: no lock base. */
  tray?: boolean;
  /** Orientations this piece can take on this board (dash count of the rotate ring). */
  positions?: number;
  /** Direction light travels into the piece (prisms point along it). */
  inDir?: number;
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

  draw(game: GameView, input: InputView, L: Layout, nowMs: number): void {
    const ctx = this.ctx;
    const time = nowMs / 1000;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const view = input.preview ?? { board: game.board, trace: game.trace };

    this.background(L);
    this.floor(view.board, L, input);
    this.beams(view.board, view.trace, L, time, game.solved && !input.preview);
    this.pieces(view.board, view.trace, L, time);
    this.interaction(game.board, input, L, nowMs);
    if (!input.drag && game.hintShown) this.hint(game.board, game.hintShown, L, time);
    this.tray(game.board, input, L, time, input.drag ? null : game.hintShown);
    this.ghost(input, L, time);
  }

  /** The suggested step: a pulsing dashed outline plus a faint ghost of the result. */
  private hint(b: Board, h: Hint, L: Layout, time: number): void {
    const ctx = this.ctx;
    const s = L.cell;
    const pulse = 0.5 + 0.5 * Math.sin(time * 3.2);
    const center = (i: number): [number, number] => [L.bx + ((i % L.cols) + 0.5) * s, L.by + (Math.floor(i / L.cols) + 0.5) * s];
    const ring = (i: number, color: string) => {
      const [x, y] = center(i);
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.setLineDash([s * 0.1, s * 0.07]);
      ctx.lineDashOffset = -time * s * 0.25;
      ctx.beginPath();
      ctx.roundRect(x - s / 2 + 2, y - s / 2 + 2, s - 4, s - 4, s * 0.16);
      ctx.stroke();
      ctx.restore();
    };
    const target = h.kind === 'remove' ? 'rgba(255,175,150,' : 'rgba(190,210,255,';
    ring(h.cell, `${target}${0.45 + 0.45 * pulse})`);
    if (h.kind === 'place' || h.kind === 'move') {
      const [x, y] = center(h.cell);
      drawPiece(ctx, { ...h.piece, lock: 'free' }, x, y, s, { time, alpha: 0.25 + 0.3 * pulse });
      if (h.kind === 'move') {
        const [fx, fy] = center(h.from);
        ctx.save();
        ctx.strokeStyle = accent(0.35 + 0.3 * pulse);
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 6]);
        ctx.beginPath();
        ctx.moveTo(fx, fy);
        ctx.lineTo(x, y);
        ctx.stroke();
        ctx.restore();
      }
    } else if (h.kind === 'rotate') {
      const p = b.cells[h.cell];
      const [x, y] = center(h.cell);
      if (p) drawPiece(ctx, { ...p, rot: h.rot }, x, y, s, { time, alpha: 0.25 + 0.35 * pulse, tray: true });
    }
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

  private floor(b: Board, L: Layout, input: InputView): void {
    const ctx = this.ctx;
    const s = L.cell;
    const tiles = new Path2D();
    const walls = new Path2D();
    const glass = new Path2D();
    const sheen = new Path2D();
    const open = new Path2D();
    const placing = input.drag !== null || input.selectedSlot >= 0;
    for (let i = 0; i < b.size; i++) {
      const x = L.bx + (i % b.w) * s;
      const y = L.by + Math.floor(i / b.w) * s;
      const p = b.cells[i];
      if (p?.kind === 'wall') walls.roundRect(x + 1, y + 1, s - 2, s - 2, s * 0.12);
      else tiles.roundRect(x + 1.5, y + 1.5, s - 3, s - 3, s * 0.14);
      if (p?.kind === 'glass') {
        glass.roundRect(x + 3, y + 3, s - 6, s - 6, s * 0.12);
        sheen.moveTo(x + s * 0.22, y + s * 0.62);
        sheen.lineTo(x + s * 0.62, y + s * 0.22);
        sheen.moveTo(x + s * 0.4, y + s * 0.78);
        sheen.lineTo(x + s * 0.78, y + s * 0.4);
      }
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

    // Glass: a clear pane you cannot build on.
    ctx.fillStyle = 'rgba(170,205,255,0.07)';
    ctx.fill(glass);
    ctx.strokeStyle = 'rgba(170,205,255,0.3)';
    ctx.lineWidth = 1;
    ctx.stroke(glass);
    ctx.strokeStyle = 'rgba(220,235,255,0.13)';
    ctx.lineWidth = Math.max(1, s * 0.03);
    ctx.lineCap = 'round';
    ctx.stroke(sheen);
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

    // Soft splash where a beam hits a wall or emitter, or is pinched in a corner.
    for (const g of segs) {
      if (g.end !== 'face' && g.end !== 'corner') continue;
      const px = L.bx + g.x2 * s;
      const py = L.by + g.y2 * s;
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
      if (!p || p.kind === 'wall' || p.kind === 'glass') continue;
      const cx = L.bx + ((i % b.w) + 0.5) * s;
      const cy = L.by + (Math.floor(i / b.w) + 0.5) * s;
      const tgt = got.get(i);
      const style: PieceStyle = {
        time,
        got: tgt?.got ?? 0,
        ok: tgt?.ok ?? false,
        lit: t.lit[i]!,
        hit: t.hit[i]!,
        positions: b.rotations(p).length,
      };
      if (p.kind === 'prism' && t.lit[i]) {
        // Point the wedge along the strongest incoming beam.
        const arr = arrivals(b, t, i).sort((a, c) => c.mask - a.mask);
        if (arr[0]) style.inDir = arr[0].dir;
      }
      drawPiece(this.ctx, p, cx, cy, s, style);
    }
  }

  /** Hover outline, drop target and long-press progress. */
  private interaction(b: Board, input: InputView, L: Layout, nowMs: number): void {
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

  private tray(b: Board, input: InputView, L: Layout, time: number, hint: Hint | null): void {
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
      const hinted = hint?.kind === 'place' && hint.slot === i;
      const pulse = 0.5 + 0.5 * Math.sin(time * 3.2);
      ctx.fillStyle = selected ? accent(0.08) : 'rgba(150,170,230,0.035)';
      ctx.strokeStyle = selected
        ? accent(0.7)
        : hinted
          ? accent(0.35 + 0.45 * pulse)
          : input.hoverSlot === i && count > 0
            ? accent(0.2)
            : 'rgba(255,255,255,0.05)';
      ctx.lineWidth = selected || hinted ? 2 : 1;
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

  private ghost(input: InputView, L: Layout, time: number): void {
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

/** Draw one piece as an icon filling a small canvas (editor tools, tray chips). */
export function drawPieceIcon(canvas: HTMLCanvasElement, p: Piece, sizeCss: number): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  canvas.width = Math.round(sizeCss * dpr);
  canvas.height = Math.round(sizeCss * dpr);
  canvas.style.width = `${sizeCss}px`;
  canvas.style.height = `${sizeCss}px`;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, sizeCss, sizeCss);
  if (p.kind === 'wall') {
    ctx.fillStyle = '#2c3550';
    ctx.beginPath();
    ctx.roundRect(sizeCss * 0.12, sizeCss * 0.12, sizeCss * 0.76, sizeCss * 0.76, sizeCss * 0.12);
    ctx.fill();
    return;
  }
  drawPiece(ctx, p, sizeCss / 2, sizeCss / 2, sizeCss * 0.92, { time: 0, tray: true });
}

function drawPiece(ctx: CanvasRenderingContext2D, p: Piece, cx: number, cy: number, s: number, style: PieceStyle): void {
  ctx.save();
  ctx.globalAlpha = style.alpha ?? 1;
  if (!style.tray) drawBase(ctx, p, cx, cy, s, style.positions ?? KINDS[p.kind].rotSteps);
  switch (p.kind) {
    case 'emitter':
      drawEmitter(ctx, p, cx, cy, s);
      break;
    case 'target':
      drawTarget(ctx, p, cx, cy, s, style.got ?? 0, style.ok ?? false, style.time);
      break;
    case 'mirror':
      drawMirror(ctx, p, cx, cy, s);
      break;
    case 'splitter':
      drawSplitter(ctx, p, cx, cy, s, style.lit ?? 0);
      break;
    case 'prism':
      drawPrism(ctx, p, cx, cy, s, style.lit ?? 0, style.inDir ?? 0);
      break;
    case 'filter':
      drawFilter(ctx, p, cx, cy, s, style.lit ?? 0);
      break;
    case 'hole':
      drawHole(ctx, cx, cy, s, style.hit ?? 0, style.time);
      break;
    case 'portal':
      drawPortal(ctx, p, cx, cy, s, style.lit ?? 0, style.time);
      break;
    case 'glass':
      ctx.fillStyle = 'rgba(170,205,255,0.1)';
      ctx.strokeStyle = 'rgba(170,205,255,0.35)';
      ctx.beginPath();
      ctx.roundRect(cx - s * 0.42, cy - s * 0.42, s * 0.84, s * 0.84, s * 0.12);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = 'rgba(220,235,255,0.3)';
      ctx.lineWidth = Math.max(1, s * 0.04);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.25, cy + s * 0.1);
      ctx.lineTo(cx + s * 0.1, cy - s * 0.25);
      ctx.moveTo(cx - s * 0.08, cy + s * 0.27);
      ctx.lineTo(cx + s * 0.27, cy - s * 0.08);
      ctx.stroke();
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

/**
 * What the player may do, shown under the piece: plate = movable, dashed ring =
 * rotatable with one dash per available orientation.
 */
function drawBase(ctx: CanvasRenderingContext2D, p: Piece, cx: number, cy: number, s: number, positions: number): void {
  if (p.lock === 'free') {
    ctx.fillStyle = '#192133';
    ctx.strokeStyle = 'rgba(170,195,255,0.18)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(cx - s * 0.42, cy - s * 0.42, s * 0.84, s * 0.84, s * 0.16);
    ctx.fill();
    ctx.stroke();
  } else if (canRotate(p)) {
    const r = s * 0.41;
    const arc = TAU / positions;
    ctx.strokeStyle = 'rgba(170,195,255,0.3)';
    ctx.lineWidth = Math.max(1, s * 0.025);
    ctx.lineCap = 'round';
    for (let k = 0; k < positions; k++) {
      const a = -Math.PI / 2 + k * arc + arc * 0.18;
      ctx.beginPath();
      ctx.arc(cx, cy, r, a, a + arc * 0.64);
      ctx.stroke();
    }
  }
}

/** Small rivet marking a fixed piece that would otherwise look rotatable. */
function drawPin(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number): void {
  ctx.fillStyle = '#2a3245';
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, Math.max(2, s * 0.045), 0, TAU);
  ctx.fill();
  ctx.stroke();
}

/** Additive radial glow, used for optics carrying light. */
function glow(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, c: Color, alpha: number): void {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  g.addColorStop(0, rgba(c, alpha));
  g.addColorStop(1, rgba(c, 0));
  ctx.fillStyle = g;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
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

function drawMirror(ctx: CanvasRenderingContext2D, p: Piece, cx: number, cy: number, s: number): void {
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

  if (p.lock === 'fixed') drawPin(ctx, cx, cy, s);
}

function drawSplitter(ctx: CanvasRenderingContext2D, p: Piece, cx: number, cy: number, s: number, lit: Color): void {
  if (lit) glow(ctx, cx, cy, s * 0.42, lit, 0.3);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rotDegrees(p) * DEG);
  const half = s * 0.37;
  const thick = Math.max(3, s * 0.09);
  ctx.fillStyle = 'rgba(4,6,10,0.6)';
  ctx.beginPath();
  ctx.roundRect(-half - 1, -thick / 2 - 1, half * 2 + 2, thick + 2, thick / 2);
  ctx.fill();
  // A half-silvered pane: tinted glass between two bright edges.
  ctx.fillStyle = 'rgba(150,200,255,0.28)';
  ctx.strokeStyle = 'rgba(225,240,255,0.9)';
  ctx.lineWidth = Math.max(1, s * 0.018);
  ctx.beginPath();
  ctx.roundRect(-half, -thick / 2, half * 2, thick, thick / 2);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.setLineDash([s * 0.045, s * 0.045]);
  ctx.beginPath();
  ctx.moveTo(-half + thick / 2, 0);
  ctx.lineTo(half - thick / 2, 0);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
  if (p.lock === 'fixed') drawPin(ctx, cx, cy, s);
}

/**
 * A wedge pointing along the incoming light. The edge on the side red leaves
 * by is red, the other blue, so flipping the prism visibly swaps them.
 */
function drawPrism(ctx: CanvasRenderingContext2D, p: Piece, cx: number, cy: number, s: number, lit: Color, inDir: number): void {
  if (lit) glow(ctx, cx, cy, s * 0.5, lit, 0.32);
  const r = s * 0.34;
  const a = inDir * 45 * DEG;
  const at = (deg: number) => [cx + Math.cos(a + deg * DEG) * r, cy + Math.sin(a + deg * DEG) * r] as const;
  const apex = at(0);
  const backLeft = at(-125); // counter-clockwise of travel = the traveller's left
  const backRight = at(125);
  const body = new Path2D();
  body.moveTo(apex[0], apex[1]);
  body.lineTo(backRight[0], backRight[1]);
  body.lineTo(backLeft[0], backLeft[1]);
  body.closePath();
  const fill = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  fill.addColorStop(0, 'rgba(78,92,135,0.95)');
  fill.addColorStop(1, 'rgba(28,34,56,0.95)');
  ctx.fillStyle = fill;
  ctx.fill(body);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(1.5, s * 0.045);
  const edge = (from: readonly [number, number], to: readonly [number, number], style: string) => {
    ctx.strokeStyle = style;
    ctx.beginPath();
    ctx.moveTo(from[0], from[1]);
    ctx.lineTo(to[0], to[1]);
    ctx.stroke();
  };
  const leftColour = p.rot ? 4 : 1;
  edge(backLeft, backRight, 'rgba(235,240,255,0.55)'); // the face light enters by
  edge(apex, backLeft, rgba(leftColour, 0.95));
  edge(apex, backRight, rgba(5 - leftColour, 0.95));
  ctx.fillStyle = rgba(2, 0.9);
  ctx.beginPath();
  ctx.arc(apex[0], apex[1], Math.max(1.5, s * 0.03), 0, TAU);
  ctx.fill();
}

function drawFilter(ctx: CanvasRenderingContext2D, p: Piece, cx: number, cy: number, s: number, lit: Color): void {
  const pass = lit & p.color;
  if (pass) glow(ctx, cx, cy, s * 0.45, pass, 0.3);
  const r = s * 0.27;
  ctx.fillStyle = rgba(p.color, pass ? 0.42 : 0.24);
  ctx.strokeStyle = rgba(p.color, 0.9);
  ctx.lineWidth = Math.max(1.5, s * 0.04);
  ctx.beginPath();
  ctx.roundRect(cx - r, cy - r, r * 2, r * 2, s * 0.07);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.lineWidth = Math.max(1, s * 0.025);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.55, cy + r * 0.1);
  ctx.lineTo(cx + r * 0.1, cy - r * 0.55);
  ctx.stroke();
}

function drawHole(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number, hit: Color, time: number): void {
  const tint: Color = hit || 5; // violet-ish halo when idle, the swallowed colour when feeding
  glow(ctx, cx, cy, s * 0.45, tint, hit ? 0.4 : 0.16);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(time * 0.9);
  ctx.lineCap = 'round';
  for (let i = 0; i < 3; i++) {
    const r = s * (0.2 + i * 0.05);
    ctx.strokeStyle = rgba(tint, (hit ? 0.75 : 0.35) - i * 0.12);
    ctx.lineWidth = Math.max(1, s * 0.03);
    ctx.beginPath();
    ctx.arc(0, 0, r, (i * TAU) / 3, (i * TAU) / 3 + TAU * 0.42);
    ctx.stroke();
  }
  ctx.restore();
  ctx.fillStyle = '#000';
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, s * 0.15, 0, TAU);
  ctx.fill();
  ctx.stroke();
}

function drawPortal(ctx: CanvasRenderingContext2D, p: Piece, cx: number, cy: number, s: number, lit: Color, time: number): void {
  const R = s * 0.32;
  if (lit) glow(ctx, cx, cy, s * 0.55, lit, 0.35);
  const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
  core.addColorStop(0, 'rgba(120,95,220,0.55)');
  core.addColorStop(1, 'rgba(25,18,55,0.95)');
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = 'rgba(185,160,255,0.9)';
  ctx.lineWidth = Math.max(1.5, s * 0.05);
  ctx.stroke();
  // Slow swirl.
  ctx.strokeStyle = 'rgba(215,200,255,0.5)';
  ctx.lineWidth = Math.max(1, s * 0.02);
  ctx.setLineDash([s * 0.07, s * 0.06]);
  ctx.lineDashOffset = -time * s * 0.15;
  ctx.beginPath();
  ctx.arc(cx, cy, R * 0.7, 0, TAU);
  ctx.stroke();
  ctx.setLineDash([]);
  // Pips identify the pair: pair 0 has one, pair 1 two, …
  const pips = ((p.link ?? 0) % 5) + 1;
  ctx.fillStyle = 'rgba(240,235,255,0.95)';
  for (let i = 0; i < pips; i++) {
    const a = -Math.PI / 2 + (i * TAU) / pips;
    const d = pips === 1 ? 0 : R * 0.34;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, Math.max(1.5, s * 0.035), 0, TAU);
    ctx.fill();
  }
}
