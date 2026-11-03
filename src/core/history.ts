/**
 * Snapshot-based undo/redo. States are compared by key so no-op actions are
 * not recorded. Consecutive pushes with the same tag (e.g. repeated rotations
 * of one piece) coalesce into a single undo step.
 */
export class History<T> {
  private states: T[];
  private keys: string[];
  private pos = 0;
  private openTag: string | undefined;
  private readonly keyOf: (s: T) => string;

  constructor(initial: T, keyOf: (s: T) => string) {
    this.keyOf = keyOf;
    this.states = [initial];
    this.keys = [keyOf(initial)];
  }

  get current(): T {
    return this.states[this.pos]!;
  }

  get canUndo(): boolean {
    return this.pos > 0;
  }

  get canRedo(): boolean {
    return this.pos < this.states.length - 1;
  }

  /** Number of recorded steps behind the current state. */
  get depth(): number {
    return this.pos;
  }

  /** Record `state` as the new current state. Returns false if nothing changed. */
  push(state: T, tag?: string): boolean {
    const key = this.keyOf(state);
    if (key === this.keys[this.pos]) return false;
    this.states.length = this.keys.length = this.pos + 1; // drop the redo branch
    if (tag !== undefined && tag === this.openTag && this.pos > 0) {
      if (key === this.keys[this.pos - 1]) {
        // Coalescing brought us back to where the streak started: drop the step entirely.
        this.states.pop();
        this.keys.pop();
        this.pos--;
        this.openTag = undefined;
      } else {
        this.states[this.pos] = state;
        this.keys[this.pos] = key;
      }
      return true;
    }
    this.states.push(state);
    this.keys.push(key);
    this.pos++;
    this.openTag = tag;
    return true;
  }

  undo(): T | null {
    if (!this.canUndo) return null;
    this.openTag = undefined;
    return this.states[--this.pos]!;
  }

  redo(): T | null {
    if (!this.canRedo) return null;
    this.openTag = undefined;
    return this.states[++this.pos]!;
  }
}
