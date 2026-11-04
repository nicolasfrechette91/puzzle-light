import type { Hint } from '../core/hint';
import { KINDS } from '../core/piece';
import { PACKS } from '../levels';
import { $ } from './dom';
import type { Game } from './game';
import type { Input } from './input';

/** Where the levels being played come from. */
export type PlayMode = 'campaign' | 'test' | 'shared' | 'daily' | 'endless';

/** What a mode adds to the HUD (daily puzzle, endless mode). */
export interface ModeHooks {
  /** Replaces the world · level label. */
  label?: () => string;
  /** Shown before the label where there is room (hidden on phones). */
  labelPrefix?: string;
  /** Shown in the status line while playing (after hints and notices). */
  status?: () => string | null;
  /** Replaces the solved banner text. */
  solved?: () => string;
  /** Replaces "Next level". */
  action?: () => { label: string; run: () => void } | null;
  /** A "Skip" button beside the status line while unsolved (endless mode); N and ] press it. */
  skip?: () => void;
}

/** DOM toolbar, level text, solved banner and keyboard shortcuts. */
export class Hud {
  private readonly game: Game;
  private readonly input: Input;
  private mode: PlayMode = 'campaign';
  private hooks: ModeHooks = {};
  private notice = '';
  /** Added to the solved banner until the level changes (e.g. "Reflection complete"). */
  private bannerNote = '';
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
    skip: $<HTMLButtonElement>('#btn-skip'),
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
    el.skip.addEventListener('click', () => this.hooks.skip?.());
    el.cont.addEventListener('click', () => {
      const action = this.hooks.action?.();
      if (action) action.run();
      else game.next();
    });
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
      if (e === 'level') this.notice = this.bannerNote = '';
      this.update();
    });
    this.update();
  }

  setMode(mode: PlayMode, hooks: ModeHooks = {}): void {
    this.mode = mode;
    this.hooks = hooks;
    const label = mode === 'test' ? 'Back to the editor' : mode === 'shared' ? 'Edit a copy in the editor' : 'Level editor';
    this.el.edit.title = label;
    this.el.edit.setAttribute('aria-label', label);
    this.update();
  }

  private next(): void {
    if (this.hooks.skip) this.hooks.skip();
    else this.game.next();
  }

  /** Re-read state that lives outside the game (e.g. sound). */
  refresh(): void {
    this.update();
  }

  /** Extra words for the solved banner, until the next level. */
  celebrate(note: string): void {
    this.bannerNote = note;
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
    else if (key === 'l' && !mod && !this.el.levels.hidden) this.onLevels();
    else if (key === 'm' && !mod) {
      this.onSound();
      this.update();
    }
    else if ((key === ']' || key === 'n') && !mod) this.next();
    else if (key === '[' || (key === 'p' && !mod)) g.prev();
    else if (key === 'enter' && g.solved && document.activeElement === document.body && !this.el.cont.hidden) this.el.cont.click();
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
    el.num.textContent = this.hooks.label
      ? this.hooks.label()
      : this.mode === 'test'
        ? 'Testing'
        : this.mode === 'shared'
          ? 'Shared level'
          : world && n
            ? `${world.name} · ${n}`
            : `${g.index + 1} / ${g.levels.length}`;
    if (this.hooks.labelPrefix) el.num.prepend(Object.assign(document.createElement('span'), { className: 'label-prefix', textContent: this.hooks.labelPrefix }));
    const campaign = this.mode === 'campaign';
    const hub = campaign || this.mode === 'daily' || this.mode === 'endless';
    el.prev.hidden = el.next.hidden = !campaign;
    el.levels.hidden = !hub;
    // On narrow screens the editor lives in the level select during hub modes.
    el.edit.classList.toggle('wide-only', hub);
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

    el.note.textContent = g.hintShown ? describeHint(g, g.hintShown) : g.hintPending ? 'Looking for a hint…' : this.notice || this.hooks.status?.() || (g.level.note ?? '');
    el.note.classList.toggle('hinting', !!g.hintShown || g.hintPending);
    el.note.hidden = g.solved;
    el.skip.hidden = g.solved || !this.hooks.skip;
    el.solved.hidden = !g.solved;
    if (g.solved) {
      const par = g.level.par;
      const used = g.piecesUsed;
      const lock = campaign ? this.lockNote() : null;
      el.solvedText.textContent = this.hooks.solved
        ? this.hooks.solved()
        : (par === undefined ? 'Solved' : used <= par ? `Solved · ${used} of par ${par} ✦` : `Solved · ${used} pieces (par ${par})`) +
          (lock ? ` · ${lock}` : '');
      if (this.bannerNote) el.solvedText.textContent += ` · ${this.bannerNote}`;
      const action = this.hooks.action?.();
      el.cont.textContent = action ? action.label : 'Next level';
      el.cont.hidden = action ? false : !g.hasNext || !campaign;
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
