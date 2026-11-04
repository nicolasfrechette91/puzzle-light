import { COLOR_NAMES, rgba } from '../core/color';
import type { LevelData } from '../core/level';
import { KINDS, type Kind, type Lock, type Piece } from '../core/piece';
import { encodeLevel } from '../core/share';
import { applySolution, type SolveResult } from '../core/solver';
import { trace, type Trace } from '../core/trace';
import { cellAt, computeLayout, type Layout } from '../game/layout';
import { drawPieceIcon, Renderer, type GameView, type InputView } from '../game/render';
import { canGoInTray, effectiveLock, EditorModel, MAX_H, MAX_W, MIN_H, MIN_W, type Brush } from './model';
import { SolverClient } from './solver-client';
import { deleteMyLevel, loadDraft, loadMyLevels, saveDraft, saveMyLevel } from './storage';

const $ = <T extends HTMLElement>(sel: string): T => {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error(`missing ${sel}`);
  return el;
};

const TOOLS: (Kind | 'erase')[] = ['erase', 'wall', 'glass', 'emitter', 'target', 'mirror', 'splitter', 'prism', 'filter', 'hole', 'portal'];
const COLORS = [1, 2, 4, 3, 5, 6, 7];
const LONG_PRESS_MS = 450;

export interface EditorHost {
  /** Play the level being edited. */
  testPlay(level: LevelData): void;
  /** Leave the editor. */
  exit(): void;
  /** A link that plays this level. */
  shareUrl(code: string): string;
}

type CheckState =
  | { state: 'idle' }
  | { state: 'running'; key: string }
  | { state: 'done'; key: string; result: SolveResult }
  | { state: 'error'; key: string; message: string };

export class EditorUI {
  readonly model: EditorModel;
  brush: Brush = { kind: 'wall', color: 1, rot: 0, link: 1, lock: 'fixed' };

  private readonly host: EditorHost;
  private readonly canvas = $<HTMLCanvasElement>('#ed-canvas');
  private readonly stage = $<HTMLElement>('#ed-stage');
  private readonly renderer: Renderer;
  private readonly solver = new SolverClient();
  private layout: Layout;
  private size = { w: 1, h: 1 };
  private view: GameView;
  private readonly input: InputView = { preview: null, drag: null, hoverCell: -1, hoverSlot: -1, selectedSlot: -1, pressStart: null };
  private check: CheckState = { state: 'idle' };
  private checkTimer = 0;
  private shownSolution = -1;
  private stroke: { id: string; pointer: number; t0: number; cell: number; touch: boolean; moved: boolean } | null = null;
  private strokeSeq = 0;
  private active = false;
  private flash = '';
  private flashTimer = 0;

  constructor(host: EditorHost) {
    this.host = host;
    const draft = loadDraft();
    this.model = draft ? new EditorModel(draft) : EditorModel.blank();
    this.renderer = new Renderer(this.canvas);
    this.view = { board: this.model.board, trace: trace(this.model.board), solved: false, hintShown: null };
    this.layout = computeLayout(1, 1, 1, 1, 0);
    this.buildPanel();
    this.bindCanvas();
    this.bindButtons();
    this.model.on(() => this.changed());
    new ResizeObserver(([e]) => {
      this.size = { w: e!.contentRect.width, h: e!.contentRect.height };
      this.renderer.resize(this.size.w, this.size.h);
      this.relayout();
    }).observe(this.stage);
    window.addEventListener('keydown', this.onKey);
    this.changed();
  }

  /** Show the editor, optionally replacing the draft with `level`. */
  open(level?: LevelData): void {
    this.active = true;
    if (level) this.model.replace({ ...level, id: level.id.startsWith('u-') ? level.id : 'draft' });
    this.changed();
  }

  close(): void {
    this.active = false;
  }

  draw(now: number): void {
    if (this.active) this.renderer.draw(this.view, this.input, this.layout, now);
  }

  // ── state ────────────────────────────────────────────────────────────────

  private changed(): void {
    const b = this.model.board;
    const t = trace(b);
    this.view = { board: b, trace: t, solved: t.solved, hintShown: null };
    this.shownSolution = -1;
    this.input.preview = null;
    this.relayout();
    saveDraft(this.model.toLevel());
    this.scheduleCheck();
    this.renderPanel();
  }

  private relayout(): void {
    const b = this.model.board;
    this.layout = computeLayout(this.size.w, this.size.h, b.w, b.h, b.inv.length);
  }

  private key(): string {
    return JSON.stringify(this.model.toLevel());
  }

  private scheduleCheck(): void {
    window.clearTimeout(this.checkTimer);
    if (this.model.problem()) {
      this.check = { state: 'idle' };
      return;
    }
    const key = this.key();
    if (this.check.state !== 'idle' && this.check.key === key) return;
    this.check = { state: 'running', key };
    this.checkTimer = window.setTimeout(() => {
      this.solver.solve(this.model.toLevel()).then(
        (result) => {
          if (this.check.state === 'running' && this.check.key === key) this.check = { state: 'done', key, result };
          this.renderPanel();
        },
        (err: Error) => {
          if (this.check.state === 'running' && this.check.key === key) this.check = { state: 'error', key, message: err.message };
          this.renderPanel();
        },
      );
    }, 350);
  }

  /** Saving needs a finished check of exactly this state that found a solution. */
  private verified(): SolveResult | null {
    const c = this.check;
    return c.state === 'done' && c.key === this.key() && c.result.complete && c.result.count > 0 ? c.result : null;
  }

  private say(msg: string): void {
    this.flash = msg;
    window.clearTimeout(this.flashTimer);
    this.flashTimer = window.setTimeout(() => {
      this.flash = '';
      this.renderStatus();
    }, 2600);
    this.renderStatus();
  }

  // ── canvas input ─────────────────────────────────────────────────────────

  private local(e: { clientX: number; clientY: number }): [number, number] {
    const r = this.canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  private bindCanvas(): void {
    const c = this.canvas;
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('pointerdown', (e) => {
      if (this.stroke) return;
      const cell = cellAt(this.layout, ...this.local(e));
      if (cell < 0) return;
      c.setPointerCapture(e.pointerId);
      e.preventDefault();
      const touch = e.pointerType !== 'mouse';
      this.stroke = { id: `stroke:${++this.strokeSeq}`, pointer: e.pointerId, t0: performance.now(), cell, touch, moved: false };
      if (e.button === 2) {
        this.model.paint(cell, { ...this.brush, kind: 'erase' }, this.stroke.id);
        this.stroke.moved = true; // right-drag keeps erasing
        return;
      }
      if (!touch) this.apply(cell, e.shiftKey ? -1 : 1);
    });
    c.addEventListener('pointermove', (e) => {
      const cell = cellAt(this.layout, ...this.local(e));
      if (e.pointerType === 'mouse') this.input.hoverCell = cell;
      const s = this.stroke;
      if (!s || s.pointer !== e.pointerId || cell < 0 || cell === s.cell) return;
      s.cell = cell;
      // Drag-painting is for terrain and erasing; pieces go one click at a time.
      const k = e.buttons & 2 ? 'erase' : this.brush.kind;
      if (k === 'erase' || k === 'wall' || k === 'glass') {
        s.moved = true;
        this.model.paint(cell, { ...this.brush, kind: k }, s.id);
      }
    });
    const end = (e: PointerEvent) => {
      const s = this.stroke;
      if (!s || s.pointer !== e.pointerId) return;
      this.stroke = null;
      if (s.touch && !s.moved) {
        // Touch: tap applies the brush, long-press erases.
        if (performance.now() - s.t0 >= LONG_PRESS_MS) this.model.paint(s.cell, { ...this.brush, kind: 'erase' });
        else this.apply(s.cell, 1);
      }
    };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', () => (this.stroke = null));
    c.addEventListener('pointerleave', () => (this.input.hoverCell = -1));
    c.addEventListener(
      'wheel',
      (e) => {
        const cell = cellAt(this.layout, ...this.local(e));
        if (cell < 0 || !this.model.board.cells[cell]) return;
        e.preventDefault();
        if (Math.abs(e.deltaY) >= 4) this.model.rotateAt(cell, Math.sign(e.deltaY));
      },
      { passive: false },
    );
  }

  /** Click on a cell: turn a matching piece, otherwise paint the brush. */
  private apply(cell: number, dir: number): void {
    const p = this.model.board.cells[cell];
    const b = this.brush;
    const same =
      !!p &&
      b.kind !== 'erase' &&
      p.kind === b.kind &&
      (!KINDS[p.kind].colored || p.color === b.color) &&
      (!KINDS[p.kind].linked || p.link === b.link);
    if (p && same) {
      if (p.lock !== effectiveLock(p.kind, b.lock)) {
        // Same piece, different lock: change the lock, keep its orientation.
        this.model.paint(cell, { ...b, rot: p.rot });
      } else if (KINDS[p.kind].rotSteps > 1) {
        this.model.rotateAt(cell, dir);
        this.brush.rot = this.model.board.cells[cell]!.rot;
      }
      return;
    }
    this.model.paint(cell, b, this.stroke?.id);
  }

  private onKey = (e: KeyboardEvent): void => {
    if (!this.active || (e.target instanceof HTMLElement && e.target.closest('input, textarea'))) return;
    const k = e.key.toLowerCase();
    if (k === 'z' && e.shiftKey) this.model.redo();
    else if (k === 'z') this.model.undo();
    else if (k === 'y') this.model.redo();
    else if (k === 't') this.test();
    else return;
    e.preventDefault();
  };

  // ── panel ────────────────────────────────────────────────────────────────

  private brushPiece(kind: Kind): Piece {
    const p: Piece = { kind, rot: KINDS[kind].rotSteps > 1 ? this.brush.rot % KINDS[kind].rotSteps : 0, color: KINDS[kind].colored ? this.brush.color : 0, lock: 'fixed' };
    if (KINDS[kind].linked) p.link = this.brush.link;
    return p;
  }

  private buildPanel(): void {
    const tools = $('#ed-tools');
    for (const kind of TOOLS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tool';
      b.dataset.kind = kind;
      b.title = kind === 'erase' ? 'Erase (right-click also erases)' : KINDS[kind].name;
      b.setAttribute('aria-label', b.title);
      if (kind === 'erase') {
        b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 16l8-8 6 6-5 5H8z"/><path d="M9 19h11"/></svg>';
      } else {
        b.appendChild(document.createElement('canvas'));
      }
      b.addEventListener('click', () => {
        this.brush.kind = kind;
        if (kind !== 'erase' && KINDS[kind].rotSteps === 1) this.brush.rot = 0;
        this.renderPanel();
      });
      tools.appendChild(b);
    }
    const colors = $('#ed-colors');
    for (const c of COLORS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'swatch';
      b.dataset.color = String(c);
      b.title = COLOR_NAMES[c]!;
      b.setAttribute('aria-label', `${COLOR_NAMES[c]} light`);
      b.style.background = rgba(c, 1);
      b.addEventListener('click', () => {
        this.brush.color = c;
        this.renderPanel();
      });
      colors.appendChild(b);
    }
    const links = $('#ed-links');
    for (let l = 0; l < 5; l++) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip-btn';
      b.dataset.link = String(l);
      b.textContent = '•'.repeat(l + 1);
      b.title = `Portal pair ${l}`;
      b.addEventListener('click', () => {
        this.brush.link = l;
        this.renderPanel();
      });
      links.appendChild(b);
    }
    for (const b of document.querySelectorAll<HTMLButtonElement>('#ed-lock button')) {
      b.addEventListener('click', () => {
        this.brush.lock = b.dataset.lock as Lock;
        this.renderPanel();
      });
    }
  }

  private bindButtons(): void {
    const m = this.model;
    $('#ed-exit').addEventListener('click', () => this.host.exit());
    $('#ed-undo').addEventListener('click', () => m.undo());
    $('#ed-redo').addEventListener('click', () => m.redo());
    $('#ed-test').addEventListener('click', () => this.test());
    $('#ed-share').addEventListener('click', () => void this.share());
    $('#ed-save').addEventListener('click', () => this.save());
    $('#ed-tray-add').addEventListener('click', () => {
      if (this.brush.kind === 'erase' || !m.addToTray(this.brush)) this.say('Only optical pieces can go in the tray.');
    });
    $('#ed-w-dec').addEventListener('click', () => m.resize(m.board.w - 1, m.board.h));
    $('#ed-w-inc').addEventListener('click', () => m.resize(m.board.w + 1, m.board.h));
    $('#ed-h-dec').addEventListener('click', () => m.resize(m.board.w, m.board.h - 1));
    $('#ed-h-inc').addEventListener('click', () => m.resize(m.board.w, m.board.h + 1));
    const name = $<HTMLInputElement>('#ed-name');
    name.addEventListener('input', () => m.setMeta({ name: name.value }));
    const note = $<HTMLInputElement>('#ed-note');
    note.addEventListener('input', () => m.setMeta({ note: note.value }));
    const par = $<HTMLInputElement>('#ed-par');
    par.addEventListener('change', () => {
      const v = par.value.trim() === '' ? undefined : Math.max(0, Math.round(Number(par.value)));
      m.setMeta({ par: Number.isFinite(v) ? v : undefined });
    });
    const bends = $<HTMLInputElement>('#ed-bends');
    bends.addEventListener('change', () => m.setMeta({ bends: bends.checked ? 90 : 45 }));
    $('#ed-new').addEventListener('click', () => {
      m.replace(EditorModel.blank().toLevel());
      this.say('New level.');
    });
    $('#ed-export').addEventListener('click', () => void this.copy(JSON.stringify(m.toLevel(), null, 2), 'Level JSON copied.'));
    $('#ed-import').addEventListener('click', () => {
      const text = window.prompt('Paste level JSON');
      if (!text) return;
      try {
        m.replace(JSON.parse(text) as LevelData);
        this.say('Level imported.');
      } catch (e) {
        this.say(`Could not import: ${(e as Error).message}`);
      }
    });
  }

  private renderPanel(): void {
    const m = this.model;
    const b = this.brush;
    for (const el of document.querySelectorAll<HTMLButtonElement>('#ed-tools .tool')) {
      const kind = el.dataset.kind as Kind | 'erase';
      el.classList.toggle('on', kind === b.kind);
      el.setAttribute('aria-pressed', String(kind === b.kind));
      const cv = el.querySelector('canvas');
      if (cv && kind !== 'erase') drawPieceIcon(cv, this.brushPiece(kind), 30);
    }
    const colored = b.kind !== 'erase' && KINDS[b.kind].colored;
    $('#ed-colors').hidden = !colored;
    for (const el of document.querySelectorAll<HTMLButtonElement>('#ed-colors .swatch')) el.classList.toggle('on', Number(el.dataset.color) === b.color);
    $('#ed-links').hidden = b.kind !== 'portal';
    for (const el of document.querySelectorAll<HTMLButtonElement>('#ed-links .chip-btn')) el.classList.toggle('on', Number(el.dataset.link) === b.link);
    const lockable = b.kind !== 'erase';
    $('#ed-lock').hidden = !lockable;
    for (const el of document.querySelectorAll<HTMLButtonElement>('#ed-lock button')) {
      const lock = el.dataset.lock as Lock;
      const possible = lockable && effectiveLock(b.kind as Kind, lock) === lock;
      el.disabled = !possible;
      el.classList.toggle('on', lockable && effectiveLock(b.kind as Kind, b.lock) === lock);
    }
    $<HTMLButtonElement>('#ed-tray-add').disabled = b.kind === 'erase' || !canGoInTray(b.kind);

    const tray = $('#ed-tray');
    tray.replaceChildren(
      ...m.board.inv.map((s, i) => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'tray-chip';
        chip.title = `Remove one ${KINDS[s.proto.kind].name} from the tray`;
        const cv = document.createElement('canvas');
        drawPieceIcon(cv, s.proto, 22);
        chip.append(cv, `×${s.count}`, Object.assign(document.createElement('span'), { className: 'minus', textContent: '−' }));
        chip.addEventListener('click', () => m.removeFromTray(i));
        return chip;
      }),
    );
    if (!m.board.inv.length) tray.textContent = 'Tray is empty.';

    $('#ed-wv').textContent = String(m.board.w);
    $('#ed-hv').textContent = String(m.board.h);
    $<HTMLButtonElement>('#ed-w-dec').disabled = m.board.w <= MIN_W;
    $<HTMLButtonElement>('#ed-w-inc').disabled = m.board.w >= MAX_W;
    $<HTMLButtonElement>('#ed-h-dec').disabled = m.board.h <= MIN_H;
    $<HTMLButtonElement>('#ed-h-inc').disabled = m.board.h >= MAX_H;
    const setVal = (sel: string, v: string) => {
      const el = $<HTMLInputElement>(sel);
      if (document.activeElement !== el && el.value !== v) el.value = v;
    };
    setVal('#ed-name', m.meta.name);
    setVal('#ed-note', m.meta.note);
    setVal('#ed-par', m.meta.par === undefined ? '' : String(m.meta.par));
    $<HTMLInputElement>('#ed-bends').checked = m.meta.bends === 90;
    $<HTMLButtonElement>('#ed-undo').disabled = !m.canUndo;
    $<HTMLButtonElement>('#ed-redo').disabled = !m.canRedo;
    $<HTMLButtonElement>('#ed-save').disabled = !this.verified();
    $<HTMLButtonElement>('#ed-test').disabled = !!m.problem();
    $<HTMLButtonElement>('#ed-share').disabled = !!m.problem();

    this.renderCheck();
    this.renderMine();
    this.renderStatus();
  }

  private renderStatus(): void {
    const el = $('#ed-status');
    const problem = this.model.problem();
    el.className = '';
    if (this.flash) el.textContent = this.flash;
    else if (problem) {
      el.textContent = `To play this level: ${problem}.`;
      el.className = 'warn';
    } else el.textContent = 'Click to place · click a piece again to turn it · right-click erases · T tests';
  }

  private renderCheck(): void {
    const el = $('#ed-check');
    const c = this.check;
    const problem = this.model.problem();
    const line = (cls: string, text: string) => Object.assign(document.createElement('p'), { className: cls, textContent: text });
    if (problem) return el.replaceChildren(line('muted', 'The solver runs once the level is playable.'));
    if (c.state === 'idle' || c.state === 'running') return el.replaceChildren(line('muted', 'Solving…'));
    if (c.state === 'error') return el.replaceChildren(line('warn', c.message));
    const r = c.result;
    const par = this.model.meta.par;
    const nodes: HTMLElement[] = [];
    if (!r.complete) nodes.push(line('warn', `Search stopped (${r.stopped}): the level is too open to verify. Add walls or glass.`));
    else if (r.count === 0) nodes.push(line('warn', 'No solution. Players could never finish this level.'));
    else {
      const atMin = r.solutions.filter((s) => s.pieces === r.minPieces).length;
      const unique = par === undefined ? r.count === 1 : atMin === 1;
      nodes.push(
        line(
          unique ? 'ok' : 'warn',
          unique
            ? `✓ ${par === undefined ? 'Unique solution' : 'Unique at par'} · ${r.minPieces} piece${r.minPieces === 1 ? '' : 's'} · difficulty ${r.difficulty.toFixed(1)}`
            : `${r.count}${r.solutions.length < r.count ? '+' : ''} solutions. Unique levels feel fairer: try a wall or glass.`,
        ),
      );
      if (par !== undefined && par < r.minPieces) nodes.push(line('warn', `Par ${par} is impossible: at least ${r.minPieces} pieces are needed.`));
      const row = document.createElement('div');
      row.className = 'row wrap';
      r.solutions.slice(0, 6).forEach((s, i) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'chip-btn';
        btn.textContent = `Solution ${i + 1}`;
        btn.classList.toggle('on', this.shownSolution === i);
        btn.title = s.moves.join(' ');
        btn.addEventListener('click', () => this.toggleSolution(i, r));
        row.appendChild(btn);
      });
      nodes.push(row);
    }
    el.replaceChildren(...nodes);
  }

  private toggleSolution(i: number, r: SolveResult): void {
    if (this.shownSolution === i) {
      this.shownSolution = -1;
      this.input.preview = null;
    } else {
      this.shownSolution = i;
      const b = applySolution(this.model.board, r.solutions[i]!);
      const t: Trace = trace(b);
      this.input.preview = { board: b, trace: t };
    }
    this.renderCheck();
  }

  private renderMine(): void {
    const el = $('#ed-mine');
    const mine = loadMyLevels();
    if (!mine.length) {
      el.replaceChildren(Object.assign(document.createElement('p'), { className: 'muted', textContent: 'Saved levels appear here.' }));
      return;
    }
    el.replaceChildren(
      ...mine.map((l) => {
        const row = document.createElement('div');
        row.className = 'mine-row';
        const name = Object.assign(document.createElement('span'), { className: 'mine-name', textContent: l.name });
        const btn = (label: string, title: string, fn: () => void) => {
          const b = Object.assign(document.createElement('button'), { type: 'button', className: 'chip-btn', textContent: label, title });
          b.addEventListener('click', fn);
          return b;
        };
        row.append(
          name,
          btn('Edit', 'Load into the editor', () => this.model.replace(l)),
          btn('Play', 'Play this level', () => this.host.testPlay(l)),
          btn('Link', 'Copy a share link', () => void this.copy(this.host.shareUrl(encodeLevel(l)), 'Share link copied.')),
          btn('✕', 'Delete', () => {
            if (window.confirm(`Delete “${l.name}”?`)) {
              deleteMyLevel(l.id);
              this.renderMine();
            }
          }),
        );
        return row;
      }),
    );
  }

  // ── actions ──────────────────────────────────────────────────────────────

  private test(): void {
    const problem = this.model.problem();
    if (problem) return this.say(`Can't test yet: ${problem}.`);
    this.host.testPlay(this.model.toLevel());
  }

  private async share(): Promise<void> {
    if (this.model.problem()) return;
    await this.copy(this.host.shareUrl(encodeLevel(this.model.toLevel())), 'Share link copied.');
  }

  private save(): void {
    if (!this.verified()) return this.say('Wait for the solver to verify the level first.');
    const level = this.model.toLevel();
    if (!level.id.startsWith('u-')) {
      level.id = `u-${Date.now().toString(36)}`;
      this.model.setMeta({ id: level.id });
    }
    if (saveMyLevel(level)) this.say(`Saved “${level.name}”.`);
    else this.say('Could not save: browser storage is unavailable.');
    this.renderMine();
  }

  private async copy(text: string, ok: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      this.say(ok);
    } catch {
      window.prompt('Copy this:', text);
    }
  }
}
