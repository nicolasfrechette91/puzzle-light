import type { LevelData } from '../core/level';
import type { SolveResult } from '../core/solver';
import type { SolveRequest, SolveResponse } from './solve.worker';

/**
 * Runs the solver off the main thread. A new request supersedes any running
 * one (the old worker is terminated), so the editor never waits on stale work.
 */
export class SolverClient {
  private worker: Worker | null = null;
  private seq = 0;
  private pending: ((r: SolveResponse) => void) | null = null;

  private spawn(): Worker {
    const w = new Worker(new URL('./solve.worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (e: MessageEvent<SolveResponse>) => {
      if (e.data.id === this.seq && this.pending) {
        const done = this.pending;
        this.pending = null;
        done(e.data);
      }
    };
    // A worker that fails to load or crashes reports an error instead of "Solving…" forever (D-072).
    w.onerror = (e: ErrorEvent) => {
      e.preventDefault();
      w.terminate();
      if (this.worker === w) this.worker = null;
      const done = this.pending;
      this.pending = null;
      done?.({ id: this.seq, ok: false, error: `The solver stopped: ${e.message || 'it failed to load'}.` });
    };
    return w;
  }

  solve(level: LevelData, timeMs = 8000): Promise<SolveResult> {
    if (this.pending) {
      // Abandon the running search.
      this.worker?.terminate();
      this.worker = null;
      this.pending = null;
    }
    this.worker ??= this.spawn();
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      this.pending = (r) => (r.ok ? resolve(r.result) : reject(new Error(r.error)));
      const req: SolveRequest = { id, level, timeMs };
      this.worker!.postMessage(req);
    });
  }
}
