import './style.css';
import type { LevelData } from './core/level';
import { decodeLevel } from './core/share';
import type { EditorUI } from './editor/editor-ui';
import { Sound } from './game/audio';
import { Game } from './game/game';
import { Hud } from './game/hud';
import { Input } from './game/input';
import { computeLayout, type Layout } from './game/layout';
import { LevelSelect } from './game/level-select';
import { Progress, resumeIndex, UNLOCK_THRESHOLD, unlockedWorlds } from './game/progress';
import { Renderer } from './game/render';
import { ALL_LEVELS, PACKS } from './levels';

const playView = document.querySelector<HTMLElement>('#play-view')!;
const editView = document.querySelector<HTMLElement>('#edit-view')!;
const stage = document.querySelector<HTMLElement>('#stage')!;
const canvas = document.querySelector<HTMLCanvasElement>('#canvas')!;

const progress = new Progress();
const sound = new Sound();

/** World index of each campaign level, by position. */
const worldOf: number[] = PACKS.flatMap((p, w) => p.levels.map(() => w));
const campaignOpen = (i: number): boolean => unlockedWorlds(PACKS, progress.solved)[worldOf[i] ?? 0] ?? false;

// `?l=3` opens the third level directly (development); otherwise resume where the player left off.
const param = new URLSearchParams(location.search).get('l');
const devStart = param === null ? null : Number(param) - 1;
const start = devStart !== null && Number.isFinite(devStart) ? devStart : resumeIndex(PACKS, progress.solved, progress.last);
const game = new Game(ALL_LEVELS, start);
game.isOpen = devStart === null ? campaignOpen : () => true;
const renderer = new Renderer(canvas);

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
}).observe(stage);

// ── modes: campaign, shared level, editor, test play (all driven by the URL hash) ──

let editor: EditorUI | null = null;
let testLevel: LevelData | null = null;
let mode: 'campaign' | 'shared' | 'test' | 'edit' = 'campaign';
let campaignIndex = game.index;

// ── sound, effects and progress follow the game ──

let okBefore = new Set<number>();
const okNow = () => new Set(game.trace.targets.filter((t) => t.ok).map((t) => t.cell));

game.on((e) => {
  if (e === 'level' || game.board.inv.length !== layout.slots.length) relayout();
  if (e === 'level') {
    okBefore = okNow();
    renderer.fadeIn();
    if (mode === 'campaign') progress.setLast(game.level.id);
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
    if (mode === 'campaign') {
      const before = unlockedWorlds(PACKS, progress.solved);
      progress.markSolved(game.level.id, game.piecesUsed, game.hintsUsed);
      const after = unlockedWorlds(PACKS, progress.solved);
      const opened = after.findIndex((o, w) => o && !before[w]);
      if (opened >= 0) hud.say(`${PACKS[opened]!.name} is now open.`);
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
const syncSoundButton = () => (soundButton.textContent = `Sound: ${sound.enabled ? 'on' : 'off'}`);
soundButton.addEventListener('click', () => {
  sound.toggle();
  syncSoundButton();
  hud.refresh();
});
syncSoundButton();
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
}

function play(kind: 'campaign' | 'shared' | 'test', levels: LevelData[], index = 0): void {
  if (mode === 'campaign') campaignIndex = game.index;
  editor?.close();
  editView.hidden = true;
  playView.hidden = false;
  game.isOpen = kind === 'campaign' && devStart === null ? campaignOpen : () => true;
  if (kind !== mode || kind !== 'campaign') game.setLevels(levels, index);
  hud.setMode(kind);
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
    try {
      if (hash.startsWith('edit=')) level = decodeLevel(hash.slice(5));
    } catch {
      level = undefined;
    }
    if (mode === 'campaign') campaignIndex = game.index;
    mode = 'edit';
    void openEditor(level);
  } else if (hash === 'test' && testLevel) {
    play('test', [testLevel]);
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

const frame = (now: number): void => {
  if (!playView.hidden) renderer.draw(game, input, layout, now);
  editor?.draw(now);
  requestAnimationFrame(frame);
};
requestAnimationFrame(frame);

// Dev-only handle for automated browser checks; stripped from production builds.
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__pl = { game, input, layout: () => layout, editor: () => editor, progress, sound, select };
}
