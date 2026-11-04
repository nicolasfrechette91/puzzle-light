/// <reference lib="webworker" />
import { parseLevel, type LevelData } from '../core/level';
import { solve, type SolveResult } from '../core/solver';
import type { WorkerReply } from '../game/worker-client';

/** The editor's solver check, with a time limit (D-033). */
export interface SolveRequest {
  level: LevelData;
  timeMs: number;
}

declare const self: DedicatedWorkerGlobalScope;

self.onmessage = (e: MessageEvent<SolveRequest & { id: number }>) => {
  const { id, level, timeMs } = e.data;
  let reply: WorkerReply<SolveResult>;
  try {
    const t0 = performance.now();
    reply = { id, ok: true, out: solve(parseLevel(level), { deadline: t0 + timeMs, now: () => performance.now(), maxSolutions: 12 }) };
  } catch (err) {
    reply = { id, ok: false, error: (err as Error).message };
  }
  self.postMessage(reply);
};
