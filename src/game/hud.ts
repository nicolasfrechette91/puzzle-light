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
    el.num.textContent = `${g.index + 1} / ${g.levels.length}`;
    el.name.textContent = g.level.name;
    document.title = `${g.level.name} · Puzzle Light`;
    el.prev.disabled = !g.hasPrev;
    el.next.disabled = !g.hasNext;
    el.undo.disabled = !g.canUndo;
    el.redo.disabled = !g.canRedo;

    el.note.textContent = g.level.note ?? '';
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
