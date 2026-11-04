/// <reference lib="webworker" />
import { dailyLevel, movesPar } from '../core/daily';
import { endlessLevel } from '../core/endless';
import type { Generated, Tier } from '../core/generate';
import { parseLevel } from '../core/level';
import type { WorkerReply } from './worker-client';

/** Level generation off the main thread (daily puzzle, endless mode). */
export type GenRequest = { id: number; kind: 'daily'; date: string } | { id: number; kind: 'endless'; tier: Tier; n: number };

export interface GenOutput {
  generated: Generated;
  /** Fewest player actions that solve it (daily "par"). */
  movesPar: number;
}


declare const self: DedicatedWorkerGlobalScope;

self.onmessage = (e: MessageEvent<GenRequest>) => {
  const req = e.data;
  let reply: WorkerReply<GenOutput>;
  try {
    const g = req.kind === 'daily' ? dailyLevel(req.date) : endlessLevel(req.tier, req.n);
    if (!g) throw new Error('no level found for this seed');
    reply = { id: req.id, ok: true, out: { generated: g, movesPar: movesPar(parseLevel(g.level), g.solution) } };
  } catch (err) {
    reply = { id: req.id, ok: false, error: (err as Error).message };
  }
  self.postMessage(reply);
};
