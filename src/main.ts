import './style.css';
import { Game } from './game/game';
import { Hud } from './game/hud';
import { Input } from './game/input';
import { computeLayout, type Layout } from './game/layout';
import { Renderer } from './game/render';
import { ALL_LEVELS } from './levels';

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
new Hud(game, input);

new ResizeObserver(([entry]) => {
  const r = entry!.contentRect;
  size = { w: r.width, h: r.height };
  renderer.resize(size.w, size.h);
  relayout();
}).observe(stage);
game.on((e) => {
  if (e === 'level' || game.board.inv.length !== layout.slots.length) relayout();
});

const frame = (now: number): void => {
  renderer.draw(game, input, layout, now);
  requestAnimationFrame(frame);
};
requestAnimationFrame(frame);

// Dev-only handle for automated browser checks; stripped from production builds.
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__pl = { game, input, layout: () => layout };
}
