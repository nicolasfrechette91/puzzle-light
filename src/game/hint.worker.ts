/// <reference lib="webworker" />
import { parseLevel, type LevelData } from '../core/level';
import { solveForPlay, type PlaySolve } from '../core/moves';
import type { WorkerReply } from './worker-client';

/**
 * Solves the level being played, so asking for a hint never freezes the page
 * (D-061), and works out its perfect count over every solution (D-089).
 */
declare const self: DedicatedWorkerGlobalScope;

self.onmessage = (e: MessageEvent<{ id: number; level: LevelData }>) => {
  const { id, level } = e.data;
  let reply: WorkerReply<PlaySolve>;
  try {
    reply = { id, ok: true, out: solveForPlay(parseLevel(level)) };
  } catch (err) {
    reply = { id, ok: false, error: (err as Error).message };
  }
  self.postMessage(reply);
};
