import type { LevelData } from '../core/level';
import type { PlaySolve } from '../core/moves';
import type { GenOutput, GenRequest } from './generate.worker';

/** What every worker here replies: the request id, and a result or an error message. */
export type WorkerReply<T> = { id: number; ok: true; out: T } | { id: number; ok: false; error: string };

/** The worker itself failed (as opposed to answering with an error), so the request says nothing about its input. */
export class WorkerFailure extends Error {}

/** A newer request replaced this one (clients with `supersede`). */
export class Cancelled extends Error {}

export interface WorkerClientOptions {
  /**
   * Only the newest request matters: one that arrives while another is still
   * running stops the worker (the search can't be interrupted otherwise),
   * cancels the old request and starts afresh. For hints and the editor's
   * check (D-077).
   */
  supersede?: boolean;
}

/** A lazily started Web Worker with promise-based requests; several may be in flight. */
export class WorkerClient<Req, Res> {
  private worker: Worker | null = null;
  private seq = 0;
  private readonly pending = new Map<number, { resolve: (o: Res) => void; reject: (e: Error) => void }>();
  private readonly make: () => Worker;
  private readonly supersede: boolean;

  constructor(make: () => Worker, opts: WorkerClientOptions = {}) {
    this.make = make;
    this.supersede = opts.supersede ?? false;
  }

  private get w(): Worker {
    if (!this.worker) {
      const w = this.make();
      this.worker = w;
      w.onmessage = (e: MessageEvent<WorkerReply<Res>>) => {
        const p = this.pending.get(e.data.id);
        if (!p) return;
        this.pending.delete(e.data.id);
        if (e.data.ok) p.resolve(e.data.out);
        else p.reject(new Error(e.data.error));
      };
      // The worker couldn't start or crashed (e.g. its file is gone after a redeploy):
      // fail what's waiting so callers fall back, and start a fresh worker next time (D-072).
      w.onerror = (e: ErrorEvent) => {
        e.preventDefault();
        this.stop(w, new WorkerFailure(`the worker stopped: ${e.message || 'it failed to load'}`));
      };
    }
    return this.worker;
  }

  /** End this worker and fail every waiting request with `reason`; the next request starts a new one. */
  private stop(w: Worker, reason: Error): void {
    w.terminate();
    if (this.worker === w) this.worker = null;
    const waiting = [...this.pending.values()];
    this.pending.clear();
    for (const p of waiting) p.reject(reason);
  }

  request(req: Req): Promise<Res> {
    if (this.supersede && this.worker && this.pending.size) this.stop(this.worker, new Cancelled('replaced by a newer request'));
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.w.postMessage({ ...req, id });
    });
  }
}

type WithoutId<R> = R extends { id: number } ? Omit<R, 'id'> : never;

/** Level generation (daily puzzle, endless mode). */
export const generator = () =>
  new WorkerClient<WithoutId<GenRequest>, GenOutput>(() => new Worker(new URL('./generate.worker.ts', import.meta.url), { type: 'module' }));

/** Solutions for hints and the perfect count, found off the main thread; only the level being played matters. */
export const hintSolver = () =>
  new WorkerClient<{ level: LevelData }, PlaySolve>(() => new Worker(new URL('./hint.worker.ts', import.meta.url), { type: 'module' }), {
    supersede: true,
  });
