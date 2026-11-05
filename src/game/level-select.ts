import type { Tier } from '../core/generate';
import { isPerfect, PERFECT_MARK, plural } from '../core/moves';
import { PACKS } from '../levels';
import { $ } from './dom';
import type { Game } from './game';
import { starsFor, UNLOCK_THRESHOLD, unlockedWorlds, type Progress } from './progress';

/** The level select sheet: worlds, progress, par marks and world gates (D-036). */
export class LevelSelect {
  private readonly game: Game;
  private readonly progress: Progress;
  private readonly root = $('#levels');
  private readonly body = $('#levels-body');
  private returnFocus: HTMLElement | null = null;
  /** Play campaign level `index` (the caller switches modes if needed). */
  onPick: (index: number) => void = () => {};
  /** Today's daily puzzle, for the card at the top (null hides it). */
  daily: () => { title: string; status: string; solved: boolean; streak: number; best: number } | null = () => null;
  onDaily: () => void = () => {};
  /** Endless mode, for the card under the daily one (null hides it). */
  endless: () => { title: string; status: string; tiers: { tier: Tier; label: string; tip: string; current: boolean }[] } | null = () => null;
  onEndless: (tier: Tier) => void = () => {};

  constructor(game: Game, progress: Progress) {
    this.game = game;
    this.progress = progress;
    $('#levels-close').addEventListener('click', () => this.close());
    $('#key-bulb').append(bulb());
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

  /** Draw the sheet again if it is open (after progress changed underneath it, e.g. an import). */
  refresh(): void {
    if (this.isOpen) this.render();
  }

  close(): void {
    if (this.root.hidden) return;
    this.root.hidden = true;
    this.returnFocus?.focus();
  }

  private render(): void {
    const open = unlockedWorlds(PACKS, this.progress.solved, this.progress.parMet);
    const current = this.game.levels === undefined ? '' : this.game.level.id;
    let index = 0;
    const cards: HTMLElement[] = [];
    const d = this.daily();
    if (d) {
      const card = document.createElement('section');
      card.className = `mode-card${d.solved ? ' done' : ''}`;
      const text = document.createElement('div');
      text.append(
        Object.assign(document.createElement('h3'), { textContent: d.title }),
        Object.assign(document.createElement('p'), { textContent: d.status }),
      );
      if (d.best > 1) text.append(Object.assign(document.createElement('p'), { className: 'muted-line', textContent: `Best streak ${d.best}` }));
      const play = Object.assign(document.createElement('button'), { type: 'button', className: 'pill', textContent: d.solved ? 'Replay' : 'Play' });
      play.addEventListener('click', () => this.onDaily());
      card.append(text, play);
      cards.push(card);
    }
    const e = this.endless();
    if (e) {
      const card = document.createElement('section');
      card.className = 'mode-card';
      const text = document.createElement('div');
      text.append(
        Object.assign(document.createElement('h3'), { textContent: e.title }),
        Object.assign(document.createElement('p'), { textContent: e.status }),
      );
      const tiers = document.createElement('div');
      tiers.className = 'tier-pills';
      tiers.setAttribute('role', 'group');
      tiers.setAttribute('aria-label', 'Endless difficulty');
      for (const t of e.tiers) {
        const b = Object.assign(document.createElement('button'), { type: 'button', className: `pill small${t.current ? ' on' : ''}`, textContent: t.label, title: t.tip });
        b.addEventListener('click', () => this.onEndless(t.tier));
        tiers.append(b);
      }
      card.append(text, tiers);
      cards.push(card);
    }
    this.body.replaceChildren(
      ...cards,
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
          const s = starsFor(PACKS, w, this.progress.parMet);
          section.append(
            Object.assign(document.createElement('p'), {
              className: 'lock-note',
              textContent: pack.gate === 'stars' ? `Earn every ✦ to open (${s.have} / ${s.need}).` : `Solve ${need} levels in ${prev.name} to open.`,
            }),
          );
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
          const best = this.progress.movesBest(level.id);
          const perfect = !!best && isPerfect(best, this.progress.get(level.id)?.perfect);
          t.classList.toggle('solved', done);
          t.classList.toggle('current', level.id === current);
          const bestText = best ? ` · best ${plural(best.moves, 'move')}${best.hinted ? ' with a hint' : ''}${perfect ? `, ${PERFECT_MARK} perfect` : ''}` : '';
          t.title = `${level.name}${done ? ' · solved' : ''}${bestText}${level.par !== undefined ? ` · par ${level.par}${par ? ' ✦' : ''}` : ''}`;
          t.setAttribute('aria-label', `${pack.name} ${n + 1}: ${t.title}`);
          if (par) t.append(Object.assign(document.createElement('span'), { className: 'mark', textContent: '✦', title: MARK_TIPS.par }));
          if (best) {
            // The best move count under the number (D-082): ◎ when perfect, a small bulb when a hint helped.
            // Each mark explains itself on hover (D-085); the tile's label says it all for screen readers.
            const line = Object.assign(document.createElement('span'), { className: `best${perfect ? ' perfect' : ''}` });
            line.setAttribute('aria-hidden', 'true');
            if (perfect) line.append(Object.assign(document.createElement('span'), { textContent: PERFECT_MARK, title: MARK_TIPS.perfect }));
            line.append(Object.assign(document.createElement('span'), { textContent: String(best.moves), title: `Your best: ${plural(best.moves, 'move')}` }));
            if (best.hinted) {
              const hint = Object.assign(document.createElement('span'), { className: 'hinted', title: MARK_TIPS.hint });
              hint.append(bulb());
              line.append(hint);
            }
            t.classList.add('has-best');
            t.append(line);
          }
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

/** What each tile mark means, for its tooltip; the key under Options says the same (D-085). */
const MARK_TIPS = {
  par: 'Par: solved with the fewest pieces',
  perfect: 'Perfect: solved in the fewest moves',
  hint: 'This best used a hint',
} as const;

/** The hint button's lightbulb, small: this best used a hint (also drawn in the key under Options). */
export function bulb(): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.classList.add('bulb');
  for (const d of ['M9 18h6', 'M10 21h4', 'M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z']) {
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
}
