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
  /** Keyboard cursor cell (-1 or absent: none). */
  cursor?: number;
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
  /** Drawn as an icon (palette, tray): canonical orientation, no lock base, a cue for what it does. */
  icon?: boolean;
  /** Drawn without its lock base (e.g. a hint's ghost orientation). */
  bare?: boolean;
  /** Orientations this piece can take on this board (dash count of the rotate ring). */
  positions?: number;
  /** Direction light travels into the piece (prisms point along it). */
  inDir?: number;
  /** Displayed angle in degrees, when animating towards the real orientation. */
  angle?: number;
}

/** A spark drifting away from a lit target, in cell units relative to the board. */
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  age: number;
  color: Color;
  size: number;
}

const reducedMotion = (): boolean => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/** Shortest signed difference a → b on a circle of `period` degrees. */
function angleDelta(a: number, b: number, period: number): number {
  return ((((b - a) % period) + period * 1.5) % period) - period / 2;
}

export class Renderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private dpr = 1;
  private segCache: { trace: Trace; segs: Segment[] } | null = null;
  /** Low-resolution layer for the bloom: beams drawn small, then scaled up soft. */
  private readonly glow = document.createElement('canvas');
  private readonly glowCtx: CanvasRenderingContext2D | null;
  /** Displayed angles per cell, eased towards the real orientation. */
  private angles = new Map<number, { kind: string; angle: number }>();
  private particles: Particle[] = [];
  private lastMs = 0;
  private emitDebt = new Map<number, number>();
  private fadeStart = -1;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is not available');
    this.ctx = ctx;
    this.glowCtx = this.glow.getContext('2d');
  }

  /** Fade the board in (call when a new level appears). */
  fadeIn(): void {
    this.fadeStart = reducedMotion() ? -1 : -2; // resolved to a timestamp on the next frame
  }

  /** A gentle burst from each target, e.g. when the level is solved. */
  celebrate(targets: readonly { cell: number; want: Color }[], cols: number): void {
    const n = reducedMotion() ? 6 : 26;
    for (const t of targets) {
      for (let k = 0; k < n; k++) {
        const a = Math.random() * Math.PI * 2;
        const v = 0.6 + Math.random() * 1.4;
        this.particles.push({
          x: (t.cell % cols) + 0.5,
          y: Math.floor(t.cell / cols) + 0.5,
          vx: Math.cos(a) * v,
          vy: Math.sin(a) * v,
          life: 0.9 + Math.random() * 0.9,
          age: 0,
          color: t.want,
          size: 0.025 + Math.random() * 0.03,
        });
      }
    }
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
    const dt = Math.min(0.1, Math.max(0, (nowMs - (this.lastMs || nowMs)) / 1000));
    this.lastMs = nowMs;

    this.background(L);
    this.floor(view.board, L, input);
    this.beams(view.board, view.trace, L, time, game.solved && !input.preview);
    this.updateParticles(view.board, view.trace, dt);
    this.drawParticles(L);
    this.pieces(view.board, view.trace, L, time, dt);
    this.interaction(game.board, input, L, nowMs);
    if (!input.drag && game.hintShown) this.hint(game.board, game.hintShown, L, time);
    this.tray(game.board, input, L, time, input.drag ? null : game.hintShown);
    this.ghost(input, L, time);
    this.cursor(input, L, time);
    if (this.fadeStart === -2) this.fadeStart = nowMs;
    if (this.fadeStart >= 0) {
      const k = (nowMs - this.fadeStart) / 450;
      if (k >= 1) this.fadeStart = -1;
      else {
        ctx.fillStyle = BG;
        ctx.globalAlpha = 1 - k * k * (3 - 2 * k);
        ctx.fillRect(0, 0, L.width, L.height);
        ctx.globalAlpha = 1;
      }
    }
  }

  /** Keyboard cursor: a bright, softly breathing ring around the cell. */
  private cursor(input: InputView, L: Layout, time: number): void {
    const c = input.cursor ?? -1;
    if (c < 0 || input.drag) return;
    const ctx = this.ctx;
    const s = L.cell;
    const x = L.bx + (c % L.cols) * s;
    const y = L.by + Math.floor(c / L.cols) * s;
    ctx.save();
    ctx.strokeStyle = accent(0.75 + 0.2 * Math.sin(time * 4));
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.roundRect(x + 1.5, y + 1.5, s - 3, s - 3, s * 0.16);
    ctx.stroke();
    ctx.restore();
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
      if (p) drawPiece(ctx, { ...p, rot: h.rot }, x, y, s, { time, alpha: 0.25 + 0.35 * pulse, bare: true });
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
    const bricks = new Path2D();
    const open = new Path2D();
    const placing = input.drag !== null || input.selectedSlot >= 0;
    for (let i = 0; i < b.size; i++) {
      const x = L.bx + (i % b.w) * s;
      const y = L.by + Math.floor(i / b.w) * s;
      const p = b.cells[i];
      if (p?.kind === 'wall') walls.roundRect(x + 1, y + 1, s - 2, s - 2, s * 0.12);
      else tiles.roundRect(x + 1.5, y + 1.5, s - 3, s - 3, s * 0.14);
      if (p?.kind === 'wall') addBricks(bricks, x + 1, y + 1, s - 2);
      if (p?.kind === 'glass') {
        const g = glassShapes(x + s / 2, y + s / 2, s);
        glass.addPath(g.frame);
        sheen.addPath(g.shine);
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
    // Brick courses, the same pattern the wall icon uses.
    ctx.strokeStyle = 'rgba(10,13,22,0.42)';
    ctx.lineWidth = Math.max(1, s * 0.035);
    ctx.lineCap = 'butt';
    ctx.stroke(bricks);

    // Glass: a clear frame with a diagonal shine, the same shape as its icon.
    ctx.fillStyle = 'rgba(170,205,255,0.05)';
    ctx.fill(glass);
    ctx.strokeStyle = 'rgba(190,215,255,0.42)';
    ctx.lineWidth = Math.max(1, s * 0.03);
    ctx.stroke(glass);
    ctx.strokeStyle = 'rgba(225,238,255,0.32)';
    ctx.lineWidth = Math.max(1, s * 0.035);
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

    const shimmer = (solved ? 1.2 : 1) * (0.94 + 0.06 * Math.sin(time * 1.7));
    this.bloom(paths, L, shimmer);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
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

  /**
   * Bloom: stroke the beams thick into a quarter-resolution layer, then draw
   * it back scaled up. Bilinear upscaling blurs it into a soft halo, which
   * works everywhere (unlike canvas filters).
   */
  private bloom(paths: Map<Color, Path2D>, L: Layout, strength: number): void {
    const g = this.glowCtx;
    if (!g) return;
    const k = 0.25;
    const w = Math.max(1, Math.ceil(L.width * k));
    const h = Math.max(1, Math.ceil(L.height * k));
    if (this.glow.width !== w || this.glow.height !== h) {
      this.glow.width = w;
      this.glow.height = h;
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, w, h);
    g.setTransform(k, 0, 0, k, 0, 0);
    g.globalCompositeOperation = 'lighter';
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.lineWidth = L.cell * 0.32;
    for (const [color, path] of paths) {
      g.strokeStyle = rgba(color, 0.32 * strength);
      g.stroke(path);
    }
    const ctx = this.ctx;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(this.glow, 0, 0, w, h, 0, 0, w / k, h / k);
    ctx.globalAlpha = 0.6;
    // A second, slightly enlarged pass widens the halo cheaply.
    ctx.drawImage(this.glow, 0, 0, w, h, -L.cell * 0.15, -L.cell * 0.15, w / k + L.cell * 0.3, h / k + L.cell * 0.3);
    ctx.restore();
  }

  /** Sparks drift from targets that receive light; more when the colour is right. */
  private updateParticles(b: Board, t: Trace, dt: number): void {
    const calm = reducedMotion();
    for (const tg of t.targets) {
      if (!tg.got) continue;
      const rate = (tg.ok ? 7 : 2.5) * (calm ? 0.25 : 1);
      let debt = (this.emitDebt.get(tg.cell) ?? 0) + rate * dt;
      while (debt >= 1) {
        debt -= 1;
        const a = Math.random() * Math.PI * 2;
        const v = 0.12 + Math.random() * 0.3;
        this.particles.push({
          x: (tg.cell % b.w) + 0.5 + Math.cos(a) * 0.22,
          y: Math.floor(tg.cell / b.w) + 0.5 + Math.sin(a) * 0.22,
          vx: Math.cos(a) * v,
          vy: Math.sin(a) * v - 0.05,
          life: 1.2 + Math.random() * 1.2,
          age: 0,
          color: tg.got,
          size: 0.018 + Math.random() * 0.022,
        });
      }
      this.emitDebt.set(tg.cell, debt);
    }
    for (const p of this.particles) {
      p.age += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 1 - dt * 1.2;
      p.vy *= 1 - dt * 1.2;
    }
    this.particles = this.particles.filter((p) => p.age < p.life && p.x > -1 && p.y > -1 && p.x < b.w + 1 && p.y < b.h + 1);
    if (this.particles.length > 600) this.particles.splice(0, this.particles.length - 600);
  }

  private drawParticles(L: Layout): void {
    if (!this.particles.length) return;
    const ctx = this.ctx;
    const s = L.cell;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.particles) {
      const fade = Math.sin(Math.PI * Math.min(1, p.age / p.life));
      ctx.fillStyle = rgba(p.color, 0.75 * fade);
      ctx.beginPath();
      ctx.arc(L.bx + p.x * s, L.by + p.y * s, Math.max(0.8, p.size * s), 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  private pieces(b: Board, t: Trace, L: Layout, time: number, dt: number): void {
    const s = L.cell;
    const got = new Map(t.targets.map((x) => [x.cell, x]));
    const calm = reducedMotion();
    const ease = calm ? 1 : 1 - Math.exp(-dt * 16);
    const next = new Map<number, { kind: string; angle: number }>();
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
      // Ease the displayed angle towards the real one along the shortest way,
      // respecting each piece's symmetry (a mirror looks the same after 180°).
      const real = p.kind === 'prism' ? (style.inDir ?? 0) * 45 : rotDegrees(p);
      const period = p.kind === 'mirror' || p.kind === 'splitter' ? 180 : 360;
      const prev = this.angles.get(i);
      const angle = prev && prev.kind === p.kind ? prev.angle + angleDelta(prev.angle, real, period) * ease : real;
      next.set(i, { kind: p.kind, angle });
      style.angle = angle;
      drawPiece(this.ctx, p, cx, cy, s, style);
    }
    this.angles = next;
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
      // Slightly small and high, leaving the bottom-right corner to the count.
      drawPiece(ctx, slot.proto, r.x + r.w / 2, r.y + r.h * 0.46, r.w * 0.76, { time, alpha: count > 0 ? 1 : 0.22, icon: true });
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

/**
 * Draw a piece (or the eraser tool) as an icon filling a small canvas: editor
 * palette, tray chips. Icons use the same drawers as the board, in a canonical
 * orientation, plus a cue for what the piece does (an emitter's beam, a
 * prism's fan).
 */
export function drawPieceIcon(canvas: HTMLCanvasElement, p: Piece | 'erase', sizeCss: number): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  canvas.width = Math.round(sizeCss * dpr);
  canvas.height = Math.round(sizeCss * dpr);
  canvas.style.width = `${sizeCss}px`;
  canvas.style.height = `${sizeCss}px`;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, sizeCss, sizeCss);
  if (p === 'erase') drawEraser(ctx, sizeCss / 2, sizeCss / 2, sizeCss);
  else drawPiece(ctx, p, sizeCss / 2, sizeCss / 2, sizeCss, { time: 0, icon: true });
}

/** Orientation icons are drawn in, so each kind always shows the same silhouette. */
const ICON_ANGLE: Partial<Record<Piece['kind'], number>> = { mirror: 135, splitter: 135, emitter: 0 };

function drawPiece(ctx: CanvasRenderingContext2D, p: Piece, cx: number, cy: number, s: number, style: PieceStyle): void {
  ctx.save();
  ctx.globalAlpha = style.alpha ?? 1;
  const icon = style.icon ?? false;
  if (!icon && !style.bare) drawBase(ctx, p, cx, cy, s, style.positions ?? KINDS[p.kind].rotSteps);
  const angle = icon ? ICON_ANGLE[p.kind] : style.angle;
  switch (p.kind) {
    case 'wall':
      drawWall(ctx, cx - s * 0.4, cy - s * 0.4, s * 0.8, true);
      break;
    case 'glass':
      drawGlass(ctx, cx, cy, s, icon ? 1 : 0.6);
      break;
    case 'emitter':
      drawEmitter(ctx, p, cx, cy, s, angle, icon);
      break;
    case 'target':
      drawTarget(ctx, p, cx, cy, s, style.got ?? 0, style.ok ?? false, style.time, icon);
      break;
    case 'mirror':
      drawMirror(ctx, p, cx, cy, s, angle, icon);
      break;
    case 'splitter':
      drawSplitter(ctx, p, cx, cy, s, style.lit ?? 0, angle, icon);
      break;
    case 'prism':
      drawPrism(ctx, p, cx, cy, s, style.lit ?? 0, icon ? 0 : (style.angle ?? (style.inDir ?? 0) * 45), icon);
      break;
    case 'filter':
      drawFilter(ctx, p, cx, cy, s, style.lit ?? 0, icon);
      break;
    case 'hole':
      drawHole(ctx, cx, cy, s, style.hit ?? 0, style.time, icon);
      break;
    case 'portal':
      drawPortal(ctx, p, cx, cy, s, style.lit ?? 0, style.time, icon);
      break;
  }
  ctx.restore();
}

/** Brick courses for a wall block at (x, y) of size w: three rows, staggered joints. */
function addBricks(path: Path2D, x: number, y: number, w: number): void {
  const inset = w * 0.08;
  const r1 = y + w / 3;
  const r2 = y + (2 * w) / 3;
  path.moveTo(x + inset, r1);
  path.lineTo(x + w - inset, r1);
  path.moveTo(x + inset, r2);
  path.lineTo(x + w - inset, r2);
  path.moveTo(x + w / 2, y + inset);
  path.lineTo(x + w / 2, r1);
  path.moveTo(x + w / 4, r1);
  path.lineTo(x + w / 4, r2);
  path.moveTo(x + (3 * w) / 4, r1);
  path.lineTo(x + (3 * w) / 4, r2);
  path.moveTo(x + w / 2, r2);
  path.lineTo(x + w / 2, y + w - inset);
}

/** A solid block with brick courses (icons and drag ghosts; board walls are batched in `floor`). */
function drawWall(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, icon: boolean): void {
  ctx.fillStyle = icon ? '#3a4563' : '#2c3550';
  ctx.beginPath();
  ctx.roundRect(x, y, w, w, w * 0.14);
  ctx.fill();
  const bricks = new Path2D();
  addBricks(bricks, x, y, w);
  ctx.strokeStyle = 'rgba(10,13,22,0.85)';
  ctx.lineWidth = Math.max(1, w * 0.06);
  ctx.lineCap = 'butt';
  ctx.stroke(bricks);
}

/** Glass: a thin frame with a diagonal shine. The same shape on the board and in icons. */
function glassShapes(cx: number, cy: number, s: number): { frame: Path2D; shine: Path2D } {
  const h = s * 0.38;
  const frame = new Path2D();
  frame.roundRect(cx - h, cy - h, h * 2, h * 2, s * 0.1);
  const shine = new Path2D();
  shine.moveTo(cx - s * 0.22, cy + s * 0.1);
  shine.lineTo(cx + s * 0.1, cy - s * 0.22);
  shine.moveTo(cx - s * 0.04, cy + s * 0.22);
  shine.lineTo(cx + s * 0.22, cy - s * 0.04);
  return { frame, shine };
}

function drawGlass(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number, strength: number): void {
  const { frame, shine } = glassShapes(cx, cy, s);
  ctx.fillStyle = `rgba(170,205,255,${0.07 * strength})`;
  ctx.fill(frame);
  ctx.strokeStyle = `rgba(190,215,255,${0.75 * strength})`;
  ctx.lineWidth = Math.max(1.25, s * 0.04);
  ctx.stroke(frame);
  ctx.strokeStyle = `rgba(225,238,255,${0.7 * strength})`;
  ctx.lineWidth = Math.max(1.25, s * 0.045);
  ctx.lineCap = 'round';
  ctx.stroke(shine);
}

/** The eraser tool: a tilted two-tone block over a rubbed-out line. */
function drawEraser(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number): void {
  ctx.save();
  ctx.translate(cx, cy - s * 0.04);
  ctx.rotate(-35 * DEG);
  const w = s * 0.62;
  const h = s * 0.3;
  ctx.fillStyle = '#e8edf7';
  ctx.beginPath();
  ctx.roundRect(-w / 2, -h / 2, w, h, s * 0.06);
  ctx.fill();
  ctx.fillStyle = '#f08a9a';
  ctx.beginPath();
  ctx.roundRect(-w / 2, -h / 2, w * 0.42, h, [s * 0.06, 0, 0, s * 0.06]);
  ctx.fill();
  ctx.strokeStyle = 'rgba(5,7,13,0.9)';
  ctx.lineWidth = Math.max(1, s * 0.035);
  ctx.beginPath();
  ctx.moveTo(-w / 2 + w * 0.42, -h / 2);
  ctx.lineTo(-w / 2 + w * 0.42, h / 2);
  ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = 'rgba(232,237,247,0.6)';
  ctx.lineWidth = Math.max(1, s * 0.04);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.36, cy + s * 0.34);
  ctx.lineTo(cx + s * 0.36, cy + s * 0.34);
  ctx.stroke();
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

/**
 * Emitter: a box with a nozzle facing the beam's direction and a lens in its
 * colour. On the board the real beam leaves the nozzle; the icon draws a short
 * beam with an arrowhead instead.
 */
function drawEmitter(ctx: CanvasRenderingContext2D, p: Piece, cx: number, cy: number, s: number, angle = rotDegrees(p), icon = false): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle * DEG);
  const ox = icon ? -s * 0.14 : 0; // the icon makes room for its beam
  const b = s * (icon ? 0.24 : 0.28);
  ctx.fillStyle = '#2b3550';
  ctx.beginPath();
  ctx.roundRect(ox + b * 0.5, -s * 0.1, b * 0.5 + s * 0.17, s * 0.2, s * 0.05);
  ctx.fill();
  ctx.fillStyle = '#1b2234';
  ctx.strokeStyle = 'rgba(215,225,250,0.4)';
  ctx.lineWidth = Math.max(1, s * 0.035);
  ctx.beginPath();
  ctx.roundRect(ox - b, -b, b * 2, b * 2, s * 0.09);
  ctx.fill();
  ctx.stroke();
  glow(ctx, ox, 0, b * 1.1, p.color, 0.75);
  ctx.fillStyle = rgba(p.color, 1);
  ctx.beginPath();
  ctx.arc(ox, 0, s * 0.095, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.beginPath();
  ctx.arc(ox, 0, s * 0.04, 0, TAU);
  ctx.fill();
  if (icon) {
    const tip = s * 0.47;
    ctx.strokeStyle = rgba(p.color, 1);
    ctx.lineWidth = Math.max(1.5, s * 0.075);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(ox + b + s * 0.17, 0);
    ctx.lineTo(tip - s * 0.08, 0);
    ctx.stroke();
    ctx.fillStyle = rgba(p.color, 1);
    ctx.beginPath();
    ctx.moveTo(tip, 0);
    ctx.lineTo(tip - s * 0.13, -s * 0.1);
    ctx.lineTo(tip - s * 0.13, s * 0.1);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

/** Target: a bullseye. Outer and middle rings in the colour it wants; the centre shows what arrives. */
function drawTarget(
  ctx: CanvasRenderingContext2D,
  p: Piece,
  cx: number,
  cy: number,
  s: number,
  got: Color,
  ok: boolean,
  time: number,
  icon = false,
): void {
  const R = s * 0.31;
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
  ctx.arc(cx, cy, R + s * 0.06, 0, TAU);
  ctx.fill();
  const strong = ok || icon;
  ctx.strokeStyle = rgba(p.color, strong ? 1 : 0.6);
  ctx.lineWidth = Math.max(1.5, s * 0.07);
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, TAU);
  ctx.stroke();
  ctx.strokeStyle = rgba(p.color, strong ? 0.85 : 0.45);
  ctx.lineWidth = Math.max(1.25, s * 0.05);
  ctx.beginPath();
  ctx.arc(cx, cy, R * 0.58, 0, TAU);
  ctx.stroke();
  if (got) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const r = R * 0.38;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, rgba(got, 1));
    g.addColorStop(0.75, rgba(got, ok ? 0.95 : 0.7));
    g.addColorStop(1, rgba(got, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TAU);
    ctx.fill();
    ctx.restore();
  } else {
    ctx.fillStyle = rgba(p.color, icon ? 1 : 0.5);
    ctx.beginPath();
    ctx.arc(cx, cy, Math.max(1.5, R * 0.2), 0, TAU);
    ctx.fill();
  }
}

/** Mirror: one solid silver bar. */
function drawMirror(ctx: CanvasRenderingContext2D, p: Piece, cx: number, cy: number, s: number, angle = rotDegrees(p), icon = false): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle * DEG);
  const half = s * (icon ? 0.4 : 0.37);
  const thick = Math.max(icon ? 2.5 : 2, s * (icon ? 0.12 : 0.09));
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
  if (p.lock === 'fixed' && !icon) drawPin(ctx, cx, cy, s);
}

/** Splitter: the mirror's bar broken into three glassy segments, a half-silvered mirror. */
function drawSplitter(
  ctx: CanvasRenderingContext2D,
  p: Piece,
  cx: number,
  cy: number,
  s: number,
  lit: Color,
  angle = rotDegrees(p),
  icon = false,
): void {
  if (lit) glow(ctx, cx, cy, s * 0.42, lit, 0.3);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle * DEG);
  const half = s * (icon ? 0.41 : 0.38);
  const thick = Math.max(icon ? 2.5 : 2, s * (icon ? 0.12 : 0.09));
  const gap = Math.max(1.5, s * 0.075);
  const seg = (half * 2 - gap * 2) / 3;
  for (let k = 0; k < 3; k++) {
    const x0 = -half + k * (seg + gap);
    ctx.fillStyle = 'rgba(4,6,10,0.75)';
    ctx.beginPath();
    ctx.roundRect(x0 - 1, -thick / 2 - 1, seg + 2, thick + 2, thick / 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(150,205,255,0.55)';
    ctx.strokeStyle = 'rgba(225,242,255,0.95)';
    ctx.lineWidth = Math.max(1, s * 0.022);
    ctx.beginPath();
    ctx.roundRect(x0, -thick / 2, seg, thick, thick / 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
  if (p.lock === 'fixed' && !icon) drawPin(ctx, cx, cy, s);
}

/**
 * Prism: a wedge pointing along the incoming light. The edge on the side red
 * leaves by is red, the other blue, so flipping it visibly swaps them. The icon
 * also draws the fan of three rays it makes.
 */
function drawPrism(
  ctx: CanvasRenderingContext2D,
  p: Piece,
  cx: number,
  cy: number,
  s: number,
  lit: Color,
  angleDeg: number,
  icon = false,
): void {
  if (lit) glow(ctx, cx, cy, s * 0.5, lit, 0.32);
  const r = s * (icon ? 0.3 : 0.34);
  const a = angleDeg * DEG;
  const ox = cx + (icon ? -s * 0.16 : 0);
  const at = (deg: number) => [ox + Math.cos(a + deg * DEG) * r, cy + Math.sin(a + deg * DEG) * r] as const;
  const apex = at(0);
  const backLeft = at(-125); // counter-clockwise of travel = the traveller's left
  const backRight = at(125);
  const leftColour = p.rot ? 4 : 1;
  if (icon) {
    // The fan starts a little past the apex so it reads as light leaving, not as more prism.
    ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(1.5, s * 0.06);
    for (const [dev, c] of [
      [-28, leftColour],
      [0, 2],
      [28, 5 - leftColour],
    ] as const) {
      const d = (angleDeg + dev) * DEG;
      ctx.strokeStyle = rgba(c, 1);
      ctx.beginPath();
      ctx.moveTo(apex[0] + Math.cos(d) * s * 0.06, apex[1] + Math.sin(d) * s * 0.06);
      ctx.lineTo(apex[0] + Math.cos(d) * s * 0.3, apex[1] + Math.sin(d) * s * 0.3);
      ctx.stroke();
    }
  }
  const body = new Path2D();
  body.moveTo(apex[0], apex[1]);
  body.lineTo(backRight[0], backRight[1]);
  body.lineTo(backLeft[0], backLeft[1]);
  body.closePath();
  const fill = ctx.createRadialGradient(ox, cy, 0, ox, cy, r);
  fill.addColorStop(0, icon ? 'rgba(170,186,228,0.97)' : 'rgba(90,106,150,0.97)');
  fill.addColorStop(1, icon ? 'rgba(98,114,160,0.97)' : 'rgba(32,40,64,0.97)');
  ctx.fillStyle = fill;
  ctx.fill(body);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(1.5, s * 0.05);
  const edge = (from: readonly [number, number], to: readonly [number, number], style: string) => {
    ctx.strokeStyle = style;
    ctx.beginPath();
    ctx.moveTo(from[0], from[1]);
    ctx.lineTo(to[0], to[1]);
    ctx.stroke();
  };
  edge(backLeft, backRight, 'rgba(235,240,255,0.7)'); // the face light enters by
  edge(apex, backLeft, rgba(leftColour, 0.95));
  edge(apex, backRight, rgba(5 - leftColour, 0.95));
}

/** Filter: a frame tinted with the colour it keeps, with a funnel mark. */
function drawFilter(ctx: CanvasRenderingContext2D, p: Piece, cx: number, cy: number, s: number, lit: Color, icon = false): void {
  const pass = lit & p.color;
  if (pass) glow(ctx, cx, cy, s * 0.45, pass, 0.3);
  const r = s * (icon ? 0.36 : 0.3);
  ctx.fillStyle = rgba(p.color, pass ? 0.45 : 0.3);
  ctx.strokeStyle = rgba(p.color, 1);
  ctx.lineWidth = Math.max(1.75, s * 0.065);
  ctx.beginPath();
  ctx.roundRect(cx - r, cy - r, r * 2, r * 2, s * 0.07);
  ctx.fill();
  ctx.stroke();
  // Funnel: wide mouth, narrow spout (scaled with the frame).
  const k = r / (s * 0.3);
  ctx.fillStyle = 'rgba(245,248,255,0.92)';
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.17 * k * 0.95, cy - s * 0.13 * k);
  ctx.lineTo(cx + s * 0.17 * k * 0.95, cy - s * 0.13 * k);
  ctx.lineTo(cx + s * 0.035 * k, cy + s * 0.02 * k);
  ctx.lineTo(cx + s * 0.035 * k, cy + s * 0.15 * k);
  ctx.lineTo(cx - s * 0.035 * k, cy + s * 0.15 * k);
  ctx.lineTo(cx - s * 0.035 * k, cy + s * 0.02 * k);
  ctx.closePath();
  ctx.fill();
}

/** Black hole: a filled dark disc with a two-armed swirl, tinted by what it swallows. */
function drawHole(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number, hit: Color, time: number, icon = false): void {
  const tint: Color = hit || 5; // violet-ish when idle, the swallowed colour when feeding
  const R = s * (icon ? 0.33 : 0.31);
  if (icon) {
    const halo = ctx.createRadialGradient(cx, cy, R * 0.9, cx, cy, s * 0.5);
    halo.addColorStop(0, rgba(tint, 0.75));
    halo.addColorStop(1, rgba(tint, 0));
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(cx, cy, s * 0.5, 0, TAU);
    ctx.fill();
  } else glow(ctx, cx, cy, s * 0.5, tint, hit ? 0.42 : 0.18);
  const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
  core.addColorStop(0, '#000');
  core.addColorStop(1, '#120a22');
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = rgba(tint, icon ? 0.95 : 0.75);
  ctx.lineWidth = Math.max(1.25, s * 0.045);
  ctx.stroke();
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(icon ? 0 : time * 0.9);
  ctx.strokeStyle = rgba(tint, icon ? 0.95 : hit ? 0.9 : 0.6);
  ctx.lineWidth = Math.max(1.25, s * 0.045);
  ctx.lineCap = 'round';
  for (let arm = 0; arm < 2; arm++) {
    ctx.beginPath();
    for (let i = 0; i <= 14; i++) {
      const t = i / 14;
      const ang = arm * Math.PI + t * Math.PI * 1.25;
      const rad = R * (0.82 - t * 0.66);
      if (i === 0) ctx.moveTo(Math.cos(ang) * rad, Math.sin(ang) * rad);
      else ctx.lineTo(Math.cos(ang) * rad, Math.sin(ang) * rad);
    }
    ctx.stroke();
  }
  ctx.restore();
}

/** Portal: a tall oval doorway; dots stacked inside identify the pair (pair 0 has one, pair 1 two, …). */
function drawPortal(ctx: CanvasRenderingContext2D, p: Piece, cx: number, cy: number, s: number, lit: Color, time: number, icon = false): void {
  const rx = s * (icon ? 0.24 : 0.22);
  const ry = s * (icon ? 0.41 : 0.37);
  if (lit) glow(ctx, cx, cy, s * 0.55, lit, 0.35);
  const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, ry);
  core.addColorStop(0, 'rgba(120,95,220,0.55)');
  core.addColorStop(1, 'rgba(25,18,55,0.95)');
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = 'rgba(190,165,255,0.95)';
  ctx.lineWidth = Math.max(1.75, s * 0.065);
  ctx.stroke();
  if (!icon) {
    ctx.strokeStyle = 'rgba(215,200,255,0.45)';
    ctx.lineWidth = Math.max(1, s * 0.02);
    ctx.setLineDash([s * 0.06, s * 0.05]);
    ctx.lineDashOffset = -time * s * 0.15;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx * 0.62, ry * 0.72, 0, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  const pips = ((p.link ?? 0) % 5) + 1;
  const gap = Math.min(s * 0.11, (ry * 1.3) / Math.max(1, pips));
  ctx.fillStyle = 'rgba(245,240,255,0.95)';
  for (let i = 0; i < pips; i++) {
    ctx.beginPath();
    ctx.arc(cx, cy + (i - (pips - 1) / 2) * gap, Math.max(1.25, s * 0.038), 0, TAU);
    ctx.fill();
  }
}
