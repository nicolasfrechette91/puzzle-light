import type { Hint } from '../core/hint';
import { KINDS } from '../core/piece';
import { PACKS } from '../levels';
import type { Game } from './game';
import type { Input } from './input';

const $ = <T extends HTMLElement>(sel: string): T => {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error(`missing ${sel}`);
  return el;
};

/** DOM toolbar, level text, solved banner and keyboard shortcuts. */
export class Hud {
  private readonly game: Game;
  private readonly input: Input;
  private readonly el = {
    num: $('#level-num'),
    name: $('#level-name'),
    note: $('#note'),
    solved: $('#solved'),
    solvedText: $('#solved-text'),
    cont: $<HTMLButtonElement>('#btn-continue'),
    prev: $<HTMLButtonElement>('#btn-prev'),
    next: $<HTMLButtonElement>('#btn-next'),
    undo: $<HTMLButtonElement>('#btn-undo'),
    redo: $<HTMLButtonElement>('#btn-redo'),
    reset: $<HTMLButtonElement>('#btn-reset'),
    hint: $<HTMLButtonElement>('#btn-hint'),
  };

  constructor(game: Game, input: Input) {
    this.game = game;
    this.input = input;
    const { el } = this;
    el.prev.addEventListener('click', () => game.prev());
    el.next.addEventListener('click', () => game.next());
    el.cont.addEventListener('click', () => game.next());
    el.undo.addEventListener('click', () => game.undo());
    el.redo.addEventListener('click', () => game.redo());
    el.reset.addEventListener('click', () => game.reset());
    el.hint.addEventListener('click', () => game.hint());
    window.addEventListener('keydown', this.onKey);
    game.on(() => this.update());
    this.update();
  }

  private onKey = (e: KeyboardEvent): void => {
    if (e.altKey || (e.target instanceof HTMLElement && e.target.closest('input, textarea, select'))) return;
    const g = this.game;
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();
    let handled = true;
    if (key === 'z' && e.shiftKey) g.redo();
    else if (key === 'z') g.undo();
    else if (key === 'y') g.redo();
    else if (key === 'r' && !mod) g.reset();
    else if (key === 'h' && !mod) g.hint();
    else if ((key === ']' || key === 'n') && !mod) g.next();
    else if (key === '[' || (key === 'p' && !mod)) g.prev();
    else if (key === 'enter' && g.solved && document.activeElement === document.body) g.next();
    else if (key === 'escape') {
      this.input.cancel();
      this.input.deselect();
    } else handled = false;
    if (handled) e.preventDefault();
  };

  private update(): void {
    const { game: g, el } = this;
    // World levels are numbered "w-n"; anything else (e.g. injected while developing) falls back to an index.
    const [w, n] = g.level.id.split('-').map(Number) as [number, number];
    const world = PACKS[w - 1];
    el.num.textContent = world && n ? `${world.name} · ${n}` : `${g.index + 1} / ${g.levels.length}`;
    el.name.textContent = g.level.name;
    document.title = `${g.level.name} · Puzzle Light`;
    el.prev.disabled = !g.hasPrev;
    el.next.disabled = !g.hasNext;
    el.undo.disabled = !g.canUndo;
    el.redo.disabled = !g.canRedo;
    el.hint.disabled = g.solved;

    el.note.textContent = g.hintShown ? describeHint(g, g.hintShown) : (g.level.note ?? '');
    el.note.classList.toggle('hinting', !!g.hintShown);
    el.note.hidden = g.solved;
    el.solved.hidden = !g.solved;
    if (g.solved) {
      const par = g.level.par;
      const used = g.piecesUsed;
      el.solvedText.textContent =
        par === undefined ? 'Solved' : used <= par ? `Solved · ${used} of par ${par} ✦` : `Solved · ${used} pieces (par ${par})`;
      el.cont.hidden = !g.hasNext;
    }
  }
}

function describeHint(g: Game, h: Hint): string {
  const name = (cell: number) => KINDS[g.board.cells[cell]?.kind ?? 'mirror'].name;
  switch (h.kind) {
    case 'place':
      return `Hint: place a ${KINDS[h.piece.kind].name} on the glowing cell.`;
    case 'move':
      return `Hint: move this ${name(h.from)} to the glowing cell.`;
    case 'rotate':
      return `Hint: turn this ${name(h.cell)} to match the outline.`;
    case 'remove':
      return `Hint: this ${name(h.cell)} is in the way — take it off the board.`;
  }
}
