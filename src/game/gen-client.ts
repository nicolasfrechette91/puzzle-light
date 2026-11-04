import type { GenOutput, GenRequest, GenResponse } from './generate.worker';

type Request = GenRequest extends infer R ? (R extends { id: number } ? Omit<R, 'id'> : never) : never;

/** Generates levels in a Web Worker; several requests may be in flight. */
export class GenClient {
  private worker: Worker | null = null;
  private seq = 0;
  private readonly pending = new Map<number, { resolve: (o: GenOutput) => void; reject: (e: Error) => void }>();

  private get w(): Worker {
    if (!this.worker) {
      this.worker = new Worker(new URL('./generate.worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (e: MessageEvent<GenResponse>) => {
        const p = this.pending.get(e.data.id);
        if (!p) return;
        this.pending.delete(e.data.id);
        if (e.data.ok) p.resolve(e.data.out);
        else p.reject(new Error(e.data.error));
      };
    }
    return this.worker;
  }

  request(req: Request): Promise<GenOutput> {
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.w.postMessage({ ...req, id } as GenRequest);
    });
  }
}
