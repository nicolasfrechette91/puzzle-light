import './style.css';
import type { LevelData } from './core/level';
import { decodeLevel } from './core/share';
import type { EditorUI } from './editor/editor-ui';
import { Game } from './game/game';
import { Hud } from './game/hud';
import { Input } from './game/input';
import { computeLayout, type Layout } from './game/layout';
import { Renderer } from './game/render';
import { ALL_LEVELS } from './levels';

const playView = document.querySelector<HTMLElement>('#play-view')!;
const editView = document.querySelector<HTMLElement>('#edit-view')!;
const stage = document.querySelector<HTMLElement>('#stage')!;
const canvas = document.querySelector<HTMLCanvasElement>('#canvas')!;

// `?l=3` opens the third level (handy while developing; level select arrives in M6).
const start = Number(new URLSearchParams(location.search).get('l') ?? 1) - 1;
const game = new Game(ALL_LEVELS, Number.isFinite(start) ? start : 0);
const renderer = new Renderer(canvas);

let size = { w: 1, h: 1 };
let layout: Layout = computeLayout(1, 1, game.board.w, game.board.h, game.board.inv.length);
const relayout = (): void => {
  layout = computeLayout(size.w, size.h, game.board.w, game.board.h, game.board.inv.length);
};

const input = new Input(canvas, game, () => layout);
const hud = new Hud(game, input);

new ResizeObserver(([entry]) => {
  const r = entry!.contentRect;
  size = { w: r.width, h: r.height };
  renderer.resize(size.w, size.h);
  relayout();
}).observe(stage);
game.on((e) => {
  if (e === 'level' || game.board.inv.length !== layout.slots.length) relayout();
});

// ── modes: campaign, shared level, editor, test play (all driven by the URL hash) ──

let editor: EditorUI | null = null;
let testLevel: LevelData | null = null;
let mode: 'campaign' | 'shared' | 'test' | 'edit' = 'campaign';
let campaignIndex = game.index;

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
  playView.hidden = true;
  editView.hidden = false;
  editor.open(level);
}

function play(kind: 'campaign' | 'shared' | 'test', levels: LevelData[], index = 0): void {
  if (mode === 'campaign') campaignIndex = game.index;
  editor?.close();
  editView.hidden = true;
  playView.hidden = false;
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

const frame = (now: number): void => {
  if (!playView.hidden) renderer.draw(game, input, layout, now);
  editor?.draw(now);
  requestAnimationFrame(frame);
};
requestAnimationFrame(frame);

// Dev-only handle for automated browser checks; stripped from production builds.
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__pl = { game, input, layout: () => layout, editor: () => editor };
}
