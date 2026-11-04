import { PACKS } from '../levels';
import type { Game } from './game';
import { UNLOCK_THRESHOLD, unlockedWorlds, type Progress } from './progress';

const $ = <T extends HTMLElement>(sel: string): T => {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error(`missing ${sel}`);
  return el;
};

/** The level select sheet: worlds, progress, par marks and world gates (D-036). */
export class LevelSelect {
  private readonly game: Game;
  private readonly progress: Progress;
  private readonly root = $('#levels');
  private readonly body = $('#levels-body');
  private returnFocus: HTMLElement | null = null;
  /** Play campaign level `index` (the caller switches modes if needed). */
  onPick: (index: number) => void = () => {};

  constructor(game: Game, progress: Progress) {
    this.game = game;
    this.progress = progress;
    $('#levels-close').addEventListener('click', () => this.close());
    this.root.addEventListener('click', (e) => {
      if (e.target === this.root) this.close();
    });
    this.root.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        this.close();
      }
    });
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  open(): void {
    this.returnFocus = document.activeElement as HTMLElement | null;
    this.render();
    this.root.hidden = false;
    (this.body.querySelector<HTMLElement>('.tile.current') ?? $('#levels-close')).focus();
  }

  close(): void {
    if (this.root.hidden) return;
    this.root.hidden = true;
    this.returnFocus?.focus();
  }

  private render(): void {
    const open = unlockedWorlds(PACKS, this.progress.solved);
    const current = this.game.levels === undefined ? '' : this.game.level.id;
    let index = 0;
    this.body.replaceChildren(
      ...PACKS.map((pack, w) => {
        const section = document.createElement('section');
        section.className = 'world';
        const solved = pack.levels.filter((l) => this.progress.solved(l.id)).length;
        const pars = pack.levels.filter((l) => l.par !== undefined);
        const parsMet = pars.filter((l) => this.progress.parMet(l)).length;
        const head = document.createElement('div');
        head.className = 'world-head';
        head.append(
          Object.assign(document.createElement('h3'), { textContent: `${w + 1} · ${pack.name}` }),
          Object.assign(document.createElement('span'), {
            className: 'world-count',
            textContent: `${solved} / ${pack.levels.length} solved${pars.length ? ` · ✦ ${parsMet} / ${pars.length}` : ''}`,
          }),
        );
        section.append(head, Object.assign(document.createElement('p'), { className: 'world-blurb', textContent: pack.blurb }));
        if (!open[w]) {
          section.classList.add('locked');
          const prev = PACKS[w - 1]!;
          const need = Math.min(UNLOCK_THRESHOLD, prev.levels.length);
          section.append(Object.assign(document.createElement('p'), { className: 'lock-note', textContent: `Solve ${need} levels in ${prev.name} to open.` }));
        }
        const tiles = document.createElement('div');
        tiles.className = 'tiles';
        pack.levels.forEach((level, n) => {
          const i = index++;
          const t = document.createElement('button');
          t.type = 'button';
          t.className = 'tile';
          t.textContent = String(n + 1);
          t.disabled = !open[w];
          const done = this.progress.solved(level.id);
          const par = this.progress.parMet(level);
          t.classList.toggle('solved', done);
          t.classList.toggle('current', level.id === current);
          t.title = `${level.name}${done ? ' · solved' : ''}${level.par !== undefined ? ` · par ${level.par}${par ? ' ✦' : ''}` : ''}`;
          t.setAttribute('aria-label', `${pack.name} ${n + 1}: ${t.title}`);
          if (par) t.append(Object.assign(document.createElement('span'), { className: 'mark', textContent: '✦' }));
          t.addEventListener('click', () => {
            this.close();
            this.onPick(i);
          });
          tiles.append(t);
        });
        section.append(tiles);
        return section;
      }),
    );
  }
}
