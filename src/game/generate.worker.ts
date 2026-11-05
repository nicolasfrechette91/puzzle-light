/// <reference lib="webworker" />
import { dailyLevel } from '../core/daily';
import { EndlessSeries } from '../core/endless';
import type { Generated, Tier } from '../core/generate';
import { parseLevel } from '../core/level';
import { perfectMoves } from '../core/moves';
import type { WorkerReply } from './worker-client';

/**
 * Level generation off the main thread (daily puzzle, endless mode). An
 * endless request may carry the tier's saved solution history, so a distinct
 * tier (easy) doesn't have to remake every earlier level (D-073).
 */
export type GenRequest = { id: number; kind: 'daily'; date: string } | { id: number; kind: 'endless'; tier: Tier; n: number; history?: number[] };

export interface GenOutput {
  generated: Generated;
  /** The fewest moves that solve it (D-080). */
  perfect: number;
  /** Endless, distinct tiers: solution ids of levels 1…n, for the game to save. */
  history?: number[];
}

/** One sequence per tier for the worker's lifetime, so consecutive levels build on each other. */
const series = new Map<Tier, EndlessSeries>();
const seriesFor = (tier: Tier): EndlessSeries => {
  let s = series.get(tier);
  if (!s) series.set(tier, (s = new EndlessSeries(tier)));
  return s;
};


declare const self: DedicatedWorkerGlobalScope;

self.onmessage = (e: MessageEvent<GenRequest>) => {
  const req = e.data;
  let reply: WorkerReply<GenOutput>;
  try {
    let g: Generated | null;
    let history: number[] | undefined;
    if (req.kind === 'daily') g = dailyLevel(req.date);
    else {
      const s = seriesFor(req.tier);
      if (req.history) s.restore(req.history);
      g = s.level(req.n);
      history = s.history();
    }
    if (!g) throw new Error('no level found for this seed');
    const perfect = perfectMoves(parseLevel(g.level), [g.solution]);
    if (perfect === null) throw new Error('the level has no solution');
    const out: GenOutput = { generated: g, perfect };
    if (history?.length) out.history = history;
    reply = { id: req.id, ok: true, out };
  } catch (err) {
    reply = { id: req.id, ok: false, error: (err as Error).message };
  }
  self.postMessage(reply);
};
