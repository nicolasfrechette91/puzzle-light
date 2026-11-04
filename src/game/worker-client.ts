import type { LevelData } from '../core/level';
import type { Solution } from '../core/solver';
import type { GenOutput, GenRequest } from './generate.worker';

/** What every worker here replies: the request id, and a result or an error message. */
export type WorkerReply<T> = { id: number; ok: true; out: T } | { id: number; ok: false; error: string };

/** A lazily started Web Worker with promise-based requests; several may be in flight. */
export class WorkerClient<Req, Res> {
  private worker: Worker | null = null;
  private seq = 0;
  private readonly pending = new Map<number, { resolve: (o: Res) => void; reject: (e: Error) => void }>();

  constructor(private readonly make: () => Worker) {}

  private get w(): Worker {
    if (!this.worker) {
      this.worker = this.make();
      this.worker.onmessage = (e: MessageEvent<WorkerReply<Res>>) => {
        const p = this.pending.get(e.data.id);
        if (!p) return;
        this.pending.delete(e.data.id);
        if (e.data.ok) p.resolve(e.data.out);
        else p.reject(new Error(e.data.error));
      };
    }
    return this.worker;
  }

  request(req: Req): Promise<Res> {
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

/** Solutions for hints, found off the main thread. */
export const hintSolver = () =>
  new WorkerClient<{ level: LevelData }, Solution[]>(() => new Worker(new URL('./hint.worker.ts', import.meta.url), { type: 'module' }));
