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

/** Where the levels being played come from. */
export type PlayMode = 'campaign' | 'test' | 'shared';

/** DOM toolbar, level text, solved banner and keyboard shortcuts. */
export class Hud {
  private readonly game: Game;
  private readonly input: Input;
  private mode: PlayMode = 'campaign';
  private notice = '';
  /** Called by the pencil button: open the editor (or go back to it). */
  onEdit: () => void = () => {};
  /** Open the level select. */
  onLevels: () => void = () => {};
  /** Toggle sound; returns whether it is now on. */
  onSound: () => boolean = () => false;
  /** Whether sound is on (for the button state). */
  soundOn: () => boolean = () => false;
  /** Why the next level is closed, if it is (world gates). */
  lockNote: () => string | null = () => null;
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
    edit: $<HTMLButtonElement>('#btn-edit'),
    levels: $<HTMLButtonElement>('#btn-levels'),
    sound: $<HTMLButtonElement>('#btn-sound'),
    view: $('#play-view'),
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
    el.edit.addEventListener('click', () => this.onEdit());
    el.levels.addEventListener('click', () => this.onLevels());
    el.sound.addEventListener('click', () => {
      this.onSound();
      this.update();
    });
    window.addEventListener('keydown', this.onKey);
    game.on((e) => {
      if (e === 'level') this.notice = '';
      this.update();
    });
    this.update();
  }

  setMode(mode: PlayMode): void {
    this.mode = mode;
    const label = mode === 'test' ? 'Back to the editor' : mode === 'shared' ? 'Edit a copy in the editor' : 'Level editor';
    this.el.edit.title = label;
    this.el.edit.setAttribute('aria-label', label);
    this.update();
  }

  /** Re-read state that lives outside the game (e.g. sound). */
  refresh(): void {
    this.update();
  }

  /** A one-off message in the status line (cleared by the next level change). */
  say(message: string): void {
    this.notice = message;
    this.update();
  }

  private onKey = (e: KeyboardEvent): void => {
    if (this.el.view.hidden) return;
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
    else if (key === 'l' && !mod && this.mode === 'campaign') this.onLevels();
    else if (key === 'm' && !mod) {
      this.onSound();
      this.update();
    }
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
    el.num.textContent =
      this.mode === 'test'
        ? 'Testing'
        : this.mode === 'shared'
          ? 'Shared level'
          : world && n
            ? `${world.name} · ${n}`
            : `${g.index + 1} / ${g.levels.length}`;
    const campaign = this.mode === 'campaign';
    el.prev.hidden = el.next.hidden = el.levels.hidden = !campaign;
    // On narrow screens the editor lives in the level select during the campaign.
    el.edit.classList.toggle('wide-only', campaign);
    const on = this.soundOn();
    el.sound.classList.toggle('off', !on);
    el.sound.title = on ? 'Sound on (M)' : 'Sound off (M)';
    el.sound.setAttribute('aria-pressed', String(on));
    el.name.textContent = g.level.name;
    document.title = `${g.level.name} · Puzzle Light`;
    el.prev.disabled = !g.hasPrev;
    el.next.disabled = !g.hasNext;
    el.undo.disabled = !g.canUndo;
    el.redo.disabled = !g.canRedo;
    el.hint.disabled = g.solved;

    el.note.textContent = g.hintShown ? describeHint(g, g.hintShown) : this.notice || (g.level.note ?? '');
    el.note.classList.toggle('hinting', !!g.hintShown);
    el.note.hidden = g.solved;
    el.solved.hidden = !g.solved;
    if (g.solved) {
      const par = g.level.par;
      const used = g.piecesUsed;
      const lock = campaign ? this.lockNote() : null;
      el.solvedText.textContent =
        (par === undefined ? 'Solved' : used <= par ? `Solved · ${used} of par ${par} ✦` : `Solved · ${used} pieces (par ${par})`) +
        (lock ? ` · ${lock}` : '');
      el.cont.hidden = !g.hasNext || !campaign;
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
