import './style.css';
import { DAILY_TIER, dailyNumber, dailySeed, formatTime, movesVerdict, shareText, type DailyResult } from './core/daily';
import { endlessSeed } from './core/endless';
import { generatedId, TIERS, type Tier } from './core/generate';
import type { LevelData } from './core/level';
import { decodeLevel } from './core/share';
import type { EditorUI } from './editor/editor-ui';
import { Sound } from './game/audio';
import { DailyStore, todayLocal, untilTomorrow } from './game/daily-store';
import { EndlessStore } from './game/endless-store';
import type { GenOutput } from './game/generate.worker';
import { generator, hintSolver, WorkerFailure } from './game/worker-client';
import { Game } from './game/game';
import { Hud, type ModeHooks } from './game/hud';
import { Input } from './game/input';
import { computeLayout, type Layout } from './game/layout';
import { LevelSelect } from './game/level-select';
import { Progress, resumeIndex, starsFor, UNLOCK_THRESHOLD, unlockedWorlds } from './game/progress';
import { Renderer, setDisplay } from './game/render';
import { Settings } from './game/settings';
import { ALL_LEVELS, PACKS } from './levels';

const playView = document.querySelector<HTMLElement>('#play-view')!;
const editView = document.querySelector<HTMLElement>('#edit-view')!;
const stage = document.querySelector<HTMLElement>('#stage')!;
const canvas = document.querySelector<HTMLCanvasElement>('#canvas')!;

const progress = new Progress();
const sound = new Sound();
const settings = new Settings();

/** World index of each campaign level, by position. */
const worldOf: number[] = PACKS.flatMap((p, w) => p.levels.map(() => w));
const openWorlds = (): boolean[] => unlockedWorlds(PACKS, progress.solved, progress.parMet);
const campaignOpen = (i: number): boolean => openWorlds()[worldOf[i] ?? 0] ?? false;

// `?l=3` opens the third level directly (development); otherwise resume where the player left off.
const param = new URLSearchParams(location.search).get('l');
const devStart = param !== null && Number.isInteger(Number(param)) ? Number(param) - 1 : null;
const start = devStart ?? resumeIndex(PACKS, progress.solved, progress.last, progress.parMet);
const game = new Game(ALL_LEVELS, start);
game.isOpen = devStart === null ? campaignOpen : () => true;
// Hints solve in their own worker, so they never wait behind level generation (D-061).
const hints = hintSolver();
game.solveAsync = (level) => hints.request({ level });
game.prepareHints();
const renderer = new Renderer(canvas);

// ── drawing: only while something moves (D-076) ──

let frameQueued = false;
/** Draw again; frames keep coming while the renderers report motion. */
function requestFrame(): void {
  if (frameQueued) return;
  frameQueued = true;
  requestAnimationFrame((now) => {
    frameQueued = false;
    let moving = false;
    if (!playView.hidden) moving = renderer.draw(game, input, layout, now);
    if (editor?.draw(now)) moving = true;
    if (moving) requestFrame();
  });
}
/** Something happened: ambient motion resumes and a frame is drawn. */
function wake(): void {
  renderer.wake();
  editor?.wake();
  requestFrame();
}
// Any input counts as activity, wherever it lands.
for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'keydown', 'wheel'] as const) {
  window.addEventListener(type, wake, { capture: true, passive: true });
}
document.addEventListener('visibilitychange', wake);

let size = { w: 1, h: 1 };
let layout: Layout = computeLayout(1, 1, game.board.w, game.board.h, game.board.inv.length);
const relayout = (): void => {
  layout = computeLayout(size.w, size.h, game.board.w, game.board.h, game.board.inv.length);
};

const input = new Input(canvas, game, () => layout);
const hud = new Hud(game, input);
const select = new LevelSelect(game, progress);

new ResizeObserver(([entry]) => {
  const r = entry!.contentRect;
  size = { w: r.width, h: r.height };
  renderer.resize(size.w, size.h);
  relayout();
  wake(); // resizing clears the canvas
}).observe(stage);

// ── modes: campaign, shared level, editor, test play (all driven by the URL hash) ──

let editor: EditorUI | null = null;
let testLevel: LevelData | null = null;
let mode: 'campaign' | 'shared' | 'test' | 'edit' | 'daily' | 'endless' = 'campaign';

// ── daily puzzle (D-054) ──

const daily = new DailyStore();
const gen = generator();

interface DailySession {
  date: string;
  /** The fewest moves (D-080). */
  perfect: number;
  /** Targets lit after each move, for the share squares (D-057); its length is the moves counted so far. */
  progress: (0 | 1 | 2)[];
  started: boolean;
  /** Visible play time banked so far; the running stretch starts at `runningSince`. */
  elapsed: number;
  runningSince: number | null;
  result: DailyResult | null;
  copiedUntil: number;
}
let session: DailySession | null = null;
const elapsed = (s: DailySession) => s.elapsed + (s.runningSince !== null ? performance.now() - s.runningSince : 0);

document.addEventListener('visibilitychange', () => {
  const s = session;
  if (!s || !s.started || s.result) return;
  if (document.hidden) {
    s.elapsed = elapsed(s);
    s.runningSince = null;
  } else s.runningSince = performance.now();
});

const prettyDate = (date: string) => {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

function dailyHooks(s: DailySession): ModeHooks {
  return {
    label: () => `Daily #${dailyNumber(s.date)} · ${prettyDate(s.date)}`,
    status: () => {
      const stored = daily.result(s.date);
      if (stored && !s.result) return `Solved today in ${stored.moves} moves; replays don't change your result.`;
      // The move count itself is the HUD counter, which the player may hide until solved (D-082).
      return s.started ? `${formatTime(elapsed(s))} · perfect ${s.perfect}` : `Perfect is ${s.perfect} moves. The clock starts with your first move.`;
    },
    solvedNote: () => {
      if (!s.result) return null; // a replay: the first solve of the day stays the result
      const streak = daily.streak(s.date);
      return `${formatTime(s.result.timeMs)}${streak > 1 ? ` · 🔥 ${streak}` : ''}`;
    },
    action: () => ({ label: Date.now() < s.copiedUntil ? 'Copied ✓' : 'Share result', run: () => void shareDaily(s) }),
  };
}

async function shareDaily(s: DailySession): Promise<void> {
  const r = daily.result(s.date) ?? s.result;
  if (!r) return;
  const text = shareText(r, daily.streak(s.date), `${location.origin}${location.pathname}#daily`);
  if (navigator.share && window.matchMedia('(pointer: coarse)').matches) {
    try {
      await navigator.share({ text });
    } catch {
      // cancelled
    }
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    s.copiedUntil = Date.now() + 2000;
    hud.refresh();
    window.setTimeout(() => hud.refresh(), 2100);
  } catch {
    window.prompt('Copy your result:', text);
  }
}

async function openDaily(): Promise<void> {
  const date = todayLocal();
  let cached = daily.cachedLevel(date);
  if (!cached) {
    hud.say('Preparing today’s puzzle…');
    try {
      const out = await gen.request({ kind: 'daily', date });
      cached = { level: out.generated.level, perfect: out.perfect };
      daily.cacheLevel(date, cached);
    } catch (e) {
      hud.say(`Today’s puzzle couldn’t be made: ${(e as Error).message}.`);
      return;
    }
  }
  if (location.hash !== '#daily') return; // the player went elsewhere meanwhile
  session = { date, perfect: cached.perfect, progress: [], started: false, elapsed: 0, runningSince: null, result: null, copiedUntil: 0 };
  play('daily', [cached.level], 0, dailyHooks(session));
}

// ── endless mode (D-058) ──

const endless = new EndlessStore();
const TIER_NAME: Record<Tier, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };
const TIER_TIP: Record<Tier, string> = {
  easy: 'Small boards, mirrors, right angles',
  medium: 'Diagonals, splitters and filters',
  hard: 'Three pieces, prisms, more targets',
};

interface EndlessRun {
  tier: Tier;
  n: number;
  /** Solved or skipped, so it has been counted. */
  done: boolean;
}
let run: EndlessRun | null = null;
/** Bumped by every request; a slower, older request then doesn't win. */
let endlessToken = 0;
/** Levels made or being made: the current one and the next (prefetched). */
const made = new Map<string, Promise<GenOutput>>();
const makeEndless = (tier: Tier, n: number): Promise<GenOutput> => {
  const key = `${tier}/${n}`;
  let p = made.get(key);
  if (!p) {
    p = gen.request({ kind: 'endless', tier, n, history: endless.history(tier) });
    made.set(key, p);
    p.then(
      (out) => out.history && endless.setHistory(tier, out.history),
      () => made.delete(key),
    );
  }
  return p;
};

async function openEndless(tier: Tier): Promise<void> {
  const token = ++endlessToken;
  const hash = location.hash;
  endless.tier = tier;
  let n = endless.next(tier);
  let out: GenOutput | null = null;
  const slow = window.setTimeout(() => hud.say('Preparing a puzzle…'), 150);
  for (let tries = 0; tries < 5 && !out; tries++) {
    try {
      out = await makeEndless(tier, n);
    } catch (e) {
      if (e instanceof WorkerFailure) break; // not this seed's fault: keep its number for next time
      endless.finish(tier, n, false); // a seed with no level: move past it
      n++;
    }
  }
  window.clearTimeout(slow);
  if (token !== endlessToken || location.hash !== hash) return;
  if (!out) {
    hud.say('No puzzle could be made just now; try again in a moment.');
    return;
  }
  run = { tier, n, done: false };
  play('endless', [out.generated.level], 0, endlessHooks(run));
  for (const k of made.keys()) if (k !== `${tier}/${n}`) made.delete(k);
  makeEndless(tier, n + 1).catch(() => {}); // ready by the time this one is solved
}

function endlessHooks(r: EndlessRun): ModeHooks {
  const name = TIER_NAME[r.tier];
  return {
    labelPrefix: 'Endless · ',
    label: () => `${name} #${r.n}`,
    status: () => (endless.solved(r.tier) < 2 ? 'A fresh puzzle every time.' : null),
    solvedNote: () => {
      const k = endless.solved(r.tier);
      return `${k} ${name.toLowerCase()} puzzle${k === 1 ? '' : 's'} so far`;
    },
    action: () => ({ label: 'Next puzzle', run: () => void openEndless(r.tier) }),
    skip: () => {
      if (!r.done) {
        r.done = true;
        endless.finish(r.tier, r.n, false);
      }
      void openEndless(r.tier);
    },
  };
}

// The daily clock ticks in the status line.
window.setInterval(() => {
  if (mode === 'daily' && session?.started && !session.result && !playView.hidden) hud.refresh();
}, 1000);
let campaignIndex = game.index;

// ── sound, effects and progress follow the game ──

let okBefore = new Set<number>();
const okNow = () => new Set(game.trace.targets.filter((t) => t.ok).map((t) => t.cell));

/**
 * Where a level's best moves are saved (D-081): a campaign level by its id, a
 * generated one by generator version, tier and seed. Test and shared levels
 * aren't saved.
 */
function recordKey(): string | null {
  if (mode === 'campaign') return game.level.id;
  if (mode === 'daily' && session) return generatedId(DAILY_TIER, dailySeed(session.date));
  if (mode === 'endless' && run) return generatedId(run.tier, endlessSeed(run.tier, run.n));
  return null;
}

game.on((e) => {
  wake();
  if (e === 'level' || game.board.inv.length !== layout.slots.length) relayout();
  if (e === 'level') {
    okBefore = okNow();
    renderer.fadeIn();
    if (mode === 'campaign') progress.setLast(game.level.id);
    return;
  }
  if (e === 'solutions') {
    // Keep the perfect count with a saved best: one solved before it was known, or a level since changed.
    const key = recordKey();
    const perfect = game.perfect;
    if (key && perfect !== null) progress.setPerfect(key, perfect);
    return;
  }
  if (e === 'change') {
    switch (game.lastAction) {
      case 'rotate':
        sound.rotate(game.lastDelta);
        break;
      case 'place':
      case 'move':
        sound.place();
        break;
      case 'pickUp':
        sound.lift();
        break;
      case 'undo':
      case 'redo':
      case 'reset':
        sound.undo();
        break;
      case 'hint':
        if (game.hintShown) sound.hint();
        break;
    }
    const s = session;
    if (mode === 'daily' && s && !s.result) {
      const lit = game.trace.targets.filter((t) => t.ok).length;
      const square = lit === 0 ? 0 : lit === game.trace.targets.length ? 2 : 1;
      if (game.moves > s.progress.length) {
        if (!s.started) {
          s.started = true;
          s.runningSince = document.hidden ? null : performance.now();
        }
        s.progress.push(square);
      } else if (game.lastAction === 'rotate' && s.progress.length) {
        s.progress[s.progress.length - 1] = square; // more turns of the same piece: still one move
      }
    }
    const ok = okNow();
    if (!game.solved) {
      let k = 0;
      for (const t of game.trace.targets) if (ok.has(t.cell) && !okBefore.has(t.cell)) sound.chime(t.want, 0.05 * k++);
    }
    okBefore = ok;
  }
  if (e === 'solved') {
    sound.solved(game.trace.targets.map((t) => t.want));
    renderer.celebrate(game.trace.targets, game.board.w);
    // This play's moves against the saved best (D-081); a hinted solve is saved but marked.
    const key = recordKey();
    const before = key ? progress.movesBest(key) : undefined;
    const solve = game.hintsUsed ? { moves: game.moves, hinted: true as const } : { moves: game.moves };
    const better = key ? progress.recordMoves(key, solve, game.perfect) : false;
    hud.showSolve({ moves: game.moves, hints: game.hintsUsed, before, newBest: better && before !== undefined });
    if (mode === 'daily' && session && !session.result && !daily.result(session.date)) {
      const s = session;
      s.elapsed = elapsed(s);
      s.runningSince = null;
      s.result = { date: s.date, moves: game.moves, perfect: s.perfect, timeMs: Math.round(s.elapsed), hints: game.hintsUsed, progress: s.progress };
      daily.record(s.result); // the first completion of a date is the one that counts
      hud.refresh();
    }
    if (mode === 'endless' && run && !run.done) {
      run.done = true;
      endless.finish(run.tier, run.n, true);
      hud.refresh();
    }
    if (mode === 'campaign') {
      const pack = PACKS[worldOf[game.index] ?? 0];
      const complete = () => !!pack && pack.levels.every((l) => progress.solved(l.id));
      const before = openWorlds();
      const wasComplete = complete();
      progress.markSolved(game.level.id, game.piecesUsed, game.hintsUsed);
      const after = openWorlds();
      const opened = after.findIndex((o, w) => o && !before[w]);
      if (opened >= 0) hud.say(`${PACKS[opened]!.name} is now open.`);
      if (pack && !wasComplete && complete()) {
        // The last unsolved level of a world: a bigger moment (D-068).
        renderer.celebrateWorld();
        sound.world();
        hud.celebrate(`${pack.name} complete`);
      }
    }
  }
});

hud.soundOn = () => sound.enabled;
hud.onSound = () => sound.toggle();
hud.onLevels = () => {
  syncSoundButton();
  select.open();
};
hud.lockNote = () => {
  if (mode !== 'campaign' || game.hasNext || game.index >= game.levels.length - 1) return null;
  const w = worldOf[game.index + 1] ?? 0;
  const prev = PACKS[w - 1];
  if (PACKS[w]?.gate === 'stars') {
    const s = starsFor(PACKS, w, progress.parMet);
    return `earn every ✦ to open ${PACKS[w]!.name} (${s.have} / ${s.need})`;
  }
  return prev ? `solve ${Math.min(UNLOCK_THRESHOLD, prev.levels.length)} in ${prev.name} to open ${PACKS[w]!.name}` : null;
};
// The HUD drew once before these callbacks existed; redraw so e.g. the sound button starts correct.
hud.refresh();
select.onPick = (i) => {
  if (mode !== 'campaign') location.hash = '';
  campaignIndex = i;
  game.load(i);
};
const soundButton = document.querySelector<HTMLButtonElement>('#levels-sound')!;
const syncSoundButton = () => {
  soundButton.textContent = `Sound: ${sound.enabled ? 'on' : 'off'}`;
  soundButton.setAttribute('aria-pressed', String(sound.enabled));
};
soundButton.addEventListener('click', () => {
  sound.toggle();
  syncSoundButton();
  hud.refresh();
});
syncSoundButton();

// ── display settings: colour symbols and reduced motion (D-066, D-067) ──
const symbolsButton = document.querySelector<HTMLButtonElement>('#opt-symbols')!;
const motionButton = document.querySelector<HTMLButtonElement>('#opt-motion')!;
const movesButton = document.querySelector<HTMLButtonElement>('#opt-moves')!;
hud.movesAfterSolve = () => settings.movesAfterSolve;
const applySettings = (): void => {
  setDisplay({ symbols: settings.symbols, reduceMotion: settings.reduceMotion });
  document.documentElement.classList.toggle('symbols', settings.symbols);
  document.documentElement.classList.toggle('reduce-motion', settings.reduceMotion);
  symbolsButton.textContent = `Colour symbols: ${settings.symbols ? 'on' : 'off'}`;
  symbolsButton.setAttribute('aria-pressed', String(settings.symbols));
  motionButton.textContent = `Reduce motion: ${settings.reduceMotion ? 'on' : 'off'}${settings.motionChoice === null ? ' (system)' : ''}`;
  motionButton.setAttribute('aria-pressed', String(settings.reduceMotion));
  movesButton.textContent = `Move counter: ${settings.movesAfterSolve ? 'after solving' : 'on'}`;
  movesButton.setAttribute('aria-pressed', String(!settings.movesAfterSolve));
  hud.refresh();
};
settings.on(() => {
  applySettings();
  wake();
});
applySettings();
symbolsButton.addEventListener('click', () => (settings.symbols = !settings.symbols));
motionButton.addEventListener('click', () => (settings.reduceMotion = !settings.reduceMotion));
movesButton.addEventListener('click', () => (settings.movesAfterSolve = !settings.movesAfterSolve));

select.daily = () => {
  const date = todayLocal();
  const r = daily.result(date);
  const streak = daily.streak(date);
  return {
    title: `Daily puzzle #${dailyNumber(date)}`,
    status: r
      ? `Solved in ${movesVerdict(r)} · ${formatTime(r.timeMs)} · next in ${untilTomorrow()}`
      : `A new puzzle every day, the same for everyone${streak ? ` · 🔥 ${streak}` : ''}`,
    solved: !!r,
    streak,
    best: daily.best,
  };
};
select.onDaily = () => {
  select.close();
  location.hash = 'daily';
};
select.endless = () => ({
  title: 'Endless',
  status: 'Generated puzzles, as many as you like. Pick a difficulty:',
  tiers: TIERS.map((t) => {
    const k = endless.solved(t);
    return {
      tier: t,
      label: k ? `${TIER_NAME[t]} · ${k}` : TIER_NAME[t],
      tip: `${TIER_TIP[t]} · ${k} solved`,
      current: mode === 'endless' && run?.tier === t,
    };
  }),
});
select.onEndless = (t) => {
  select.close();
  if (mode === 'endless' && run?.tier === t) return;
  location.hash = `endless=${t}`;
};
document.querySelector('#levels-edit')!.addEventListener('click', () => {
  select.close();
  location.hash = 'edit';
});

// Audio may only start after a user gesture.
const unlockAudio = () => sound.unlock();
window.addEventListener('pointerdown', unlockAudio, { capture: true });
window.addEventListener('keydown', unlockAudio, { capture: true });

const shareUrl = (code: string): string => `${location.origin}${location.pathname}#play=${code}`;

async function openEditor(level?: LevelData): Promise<void> {
  if (!editor) {
    // The editor (and its solver worker) loads only when first needed.
    const { EditorUI } = await import('./editor/editor-ui');
    editor = new EditorUI({
      testPlay: (l) => {
        testLevel = l;
        location.hash = 'test';
      },
      exit: () => {
        location.hash = '';
      },
      shareUrl,
    });
  }
  select.close();
  playView.hidden = true;
  editView.hidden = false;
  editor.open(level);
  wake();
}

function play(kind: 'campaign' | 'shared' | 'test' | 'daily' | 'endless', levels: LevelData[], index = 0, hooks: ModeHooks = {}): void {
  if (mode === 'campaign') campaignIndex = game.index;
  editor?.close();
  editView.hidden = true;
  playView.hidden = false;
  game.isOpen = kind === 'campaign' && devStart === null ? campaignOpen : () => true;
  if (kind !== mode || kind !== 'campaign') game.setLevels(levels, index);
  hud.setMode(kind, hooks);
  mode = kind;
}

function route(): void {
  const hash = location.hash.slice(1);
  if (hash.startsWith('play=')) {
    try {
      play('shared', [decodeLevel(hash.slice(5))]);
    } catch (e) {
      play('campaign', ALL_LEVELS, campaignIndex);
      hud.say(`That link didn't work: ${(e as Error).message}.`);
    }
  } else if (hash === 'edit' || hash.startsWith('edit=')) {
    let level: LevelData | undefined;
    let problem = '';
    try {
      if (hash.startsWith('edit=')) level = decodeLevel(hash.slice(5));
    } catch (e) {
      problem = (e as Error).message; // the editor opens on the draft and says why, as #play= does
    }
    if (mode === 'campaign') campaignIndex = game.index;
    mode = 'edit';
    void openEditor(level).then(() => {
      if (problem) editor?.say(`That link didn't work: ${problem}. Here is your draft instead.`, 8000);
    });
  } else if (hash === 'test' && testLevel) {
    play('test', [testLevel]);
  } else if (hash === 'daily') {
    void openDaily();
  } else if (hash === 'endless' || hash.startsWith('endless=')) {
    const t = hash.slice('endless='.length) as Tier;
    void openEndless(TIERS.includes(t) ? t : endless.tier);
  } else {
    play('campaign', ALL_LEVELS, campaignIndex);
  }
}

hud.onEdit = () => {
  if (mode === 'shared') location.hash = `edit=${location.hash.slice('#play='.length)}`;
  else location.hash = 'edit';
};
window.addEventListener('hashchange', route);
if (location.hash) route();
progress.setLast(game.level.id);
okBefore = okNow();

requestFrame();

// Dev-only handle for automated browser checks; stripped from production builds.
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__pl = { game, input, layout: () => layout, editor: () => editor, progress, sound, select, daily, session: () => session, endless, run: () => run, settings, renderer };
}
