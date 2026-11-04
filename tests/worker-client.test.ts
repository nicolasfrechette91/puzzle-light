import { describe, expect, it } from 'vitest';
import { Cancelled, WorkerClient, WorkerFailure } from '../src/game/worker-client';

/** A stand-in Worker whose replies and failures the test drives by hand. */
class FakeWorker {
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;
  posted: { id: number }[] = [];
  terminated = false;
  postMessage(m: { id: number }) {
    this.posted.push(m);
  }
  terminate() {
    this.terminated = true;
  }
  reply(data: unknown) {
    this.onmessage?.({ data } as MessageEvent);
  }
  fail() {
    this.onerror?.({ message: 'worker script failed to load', preventDefault() {} } as unknown as Event);
  }
}

describe('WorkerClient', () => {
  it('resolves and rejects requests by id', async () => {
    const fake = new FakeWorker();
    const c = new WorkerClient<{ x: number }, number>(() => fake as unknown as Worker);
    const a = c.request({ x: 1 });
    const b = c.request({ x: 2 });
    fake.reply({ id: fake.posted[1]!.id, ok: false, error: 'nope' });
    fake.reply({ id: fake.posted[0]!.id, ok: true, out: 10 });
    await expect(a).resolves.toBe(10);
    await expect(b).rejects.toThrow('nope');
    await expect(b).rejects.not.toBeInstanceOf(WorkerFailure); // an answer, not a crash
  });

  // A worker that can't start (e.g. its file vanished in a redeploy) used to leave
  // "Looking for a hint…" or "Preparing today’s puzzle…" up forever (D-072).
  it('rejects every pending request when the worker fails, and starts a fresh one next time', async () => {
    const made: FakeWorker[] = [];
    const c = new WorkerClient<{ x: number }, number>(() => {
      made.push(new FakeWorker());
      return made[made.length - 1] as unknown as Worker;
    });
    const a = c.request({ x: 1 });
    const b = c.request({ x: 2 });
    made[0]!.fail();
    await expect(a).rejects.toBeInstanceOf(WorkerFailure);
    await expect(b).rejects.toThrow(/worker stopped/);
    expect(made[0]!.terminated).toBe(true);
    const again = c.request({ x: 3 });
    expect(made).toHaveLength(2);
    made[1]!.reply({ id: made[1]!.posted[0]!.id, ok: true, out: 3 });
    await expect(again).resolves.toBe(3);
  });

  // Hints: a level the player has left shouldn't keep the worker busy.
  it('with `supersede`, cancels a request still running when a new one arrives', async () => {
    const made: FakeWorker[] = [];
    const c = new WorkerClient<{ x: number }, number>(() => {
      made.push(new FakeWorker());
      return made[made.length - 1] as unknown as Worker;
    }, { supersede: true });
    const first = c.request({ x: 1 });
    const second = c.request({ x: 2 });
    await expect(first).rejects.toBeInstanceOf(Cancelled);
    expect(made[0]!.terminated).toBe(true);
    expect(made).toHaveLength(2);
    made[1]!.reply({ id: made[1]!.posted[0]!.id, ok: true, out: 2 });
    await expect(second).resolves.toBe(2);
    // Once nothing is running, the same worker is kept.
    const third = c.request({ x: 3 });
    expect(made).toHaveLength(2);
    made[1]!.reply({ id: made[1]!.posted[1]!.id, ok: true, out: 3 });
    await expect(third).resolves.toBe(3);
  });
});
