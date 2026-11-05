import { readJson, writeJson } from './local-store';

/**
 * Display settings: colour symbols (D-066), reduce motion (unset = follow the
 * system; D-067), and whether the move counter waits until a level is solved (D-082).
 */
const KEY = 'puzzle-light:settings';

interface Stored {
  symbols: boolean;
  reduceMotion: boolean | null;
  movesAfterSolve: boolean;
}

export class Settings {
  private data: Stored;
  private readonly listeners = new Set<() => void>();
  private readonly system = window.matchMedia?.('(prefers-reduced-motion: reduce)');

  constructor() {
    const d = readJson<Partial<Stored>>(KEY);
    this.data = {
      symbols: d?.symbols === true,
      reduceMotion: typeof d?.reduceMotion === 'boolean' ? d.reduceMotion : null,
      movesAfterSolve: d?.movesAfterSolve === true,
    };
    // Following the system means following its changes too.
    this.system?.addEventListener?.('change', () => this.emit());
  }

  on(fn: () => void): void {
    this.listeners.add(fn);
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }

  private save(): void {
    writeJson(KEY, this.data);
    this.emit();
  }

  get symbols(): boolean {
    return this.data.symbols;
  }

  set symbols(on: boolean) {
    this.data.symbols = on;
    this.save();
  }

  /** The stored choice: true, false, or null (follow the system). */
  get motionChoice(): boolean | null {
    return this.data.reduceMotion;
  }

  /** Whether motion is reduced right now. */
  get reduceMotion(): boolean {
    return this.data.reduceMotion ?? this.system?.matches ?? false;
  }

  set reduceMotion(on: boolean) {
    this.data.reduceMotion = on;
    this.save();
  }

  /** Hide the move counter until the level is solved. */
  get movesAfterSolve(): boolean {
    return this.data.movesAfterSolve;
  }

  set movesAfterSolve(on: boolean) {
    this.data.movesAfterSolve = on;
    this.save();
  }
}
