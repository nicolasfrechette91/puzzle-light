/// <reference lib="webworker" />
import { parseLevel, type LevelData } from '../core/level';
import { HINT_SOLVE, solve, type Solution } from '../core/solver';
import type { WorkerReply } from './worker-client';

/** Solves the level being played, so asking for a hint never freezes the page (D-061). */
declare const self: DedicatedWorkerGlobalScope;

self.onmessage = (e: MessageEvent<{ id: number; level: LevelData }>) => {
  const { id, level } = e.data;
  let reply: WorkerReply<Solution[]>;
  try {
    reply = { id, ok: true, out: solve(parseLevel(level), HINT_SOLVE).solutions };
  } catch (err) {
    reply = { id, ok: false, error: (err as Error).message };
  }
  self.postMessage(reply);
};
