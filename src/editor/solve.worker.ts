/// <reference lib="webworker" />
import { parseLevel, type LevelData } from '../core/level';
import { solve, type SolveResult } from '../core/solver';

export interface SolveRequest {
  id: number;
  level: LevelData;
  timeMs: number;
}

export type SolveResponse = { id: number; ok: true; result: SolveResult } | { id: number; ok: false; error: string };

declare const self: DedicatedWorkerGlobalScope;

self.onmessage = (e: MessageEvent<SolveRequest>) => {
  const { id, level, timeMs } = e.data;
  let reply: SolveResponse;
  try {
    const t0 = performance.now();
    const result = solve(parseLevel(level), { deadline: t0 + timeMs, now: () => performance.now(), maxSolutions: 12 });
    reply = { id, ok: true, result };
  } catch (err) {
    reply = { id, ok: false, error: (err as Error).message };
  }
  self.postMessage(reply);
};
