/**
 * Recapture the README media (D-086): the stills in docs/media/*.webp and the
 * frames of docs/media/gameplay.gif.
 *
 *   npm run dev                                  # in another terminal
 *   node scripts/media/capture.cjs [base-url]    # default http://localhost:5173/
 *   python3 scripts/media/make-media.py          # PNGs → WebP and GIF (needs Pillow)
 *
 * Needs Playwright with Chromium (not a project dependency). It drives the dev
 * build through `window.__pl` and imports the core straight from /src, so it
 * only works against `npm run dev`. Output goes to scripts/media/out/ (ignored).
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = process.argv[2] ?? 'http://localhost:5173/';
const OUT = path.join(__dirname, 'out');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'frames'), { recursive: true });

/** In-page helpers: open a level by id, and solve it the fewest-moves way (optionally wasting some first). */
const HELPERS = `
window.__media = {
  async open(id) {
    const g = window.__pl.game;
    window.__pl.select.onPick(g.levels.findIndex((l) => l.id === id));
    await new Promise((r) => setTimeout(r, 500)); // the hint worker finds the solutions
  },
  async plan() {
    const { solve } = await import('/src/core/solver.ts');
    const { parseLevel } = await import('/src/core/level.ts');
    const { solutionMoves } = await import('/src/core/moves.ts');
    const start = parseLevel(window.__pl.game.level);
    const sols = solve(start).solutions;
    return sols.reduce((a, s) => (solutionMoves(start, s) < solutionMoves(start, a) ? s : a)).placements;
  },
  /** Solve, after \`waste\` spare moves (an even number). */
  async solve(waste = 0) {
    const { slotKey } = await import('/src/core/token.ts');
    const g = window.__pl.game;
    const plan = await this.plan();
    for (let i = 0; i < waste; i += 2) {
      // Two spare moves that can't disturb the solution: a tray piece set down where no light goes, and lifted.
      const slot = g.board.inv.findIndex((s) => s.count > 0);
      const empty = g.board.cells.findIndex((p, k) => p === null && !g.trace.lit[k]);
      g.place(slot, empty);
      g.pickUp(empty);
    }
    for (const { cell, piece } of plan) {
      if (piece.lock === 'free') {
        const slot = g.board.inv.findIndex((s) => s.count > 0 && slotKey(s.proto) === slotKey(piece));
        g.place(slot, cell);
      }
      for (let k = 0; k < 8 && g.board.cells[cell].rot !== piece.rot; k++) g.rotate(cell, 1);
    }
    return g.moves;
  },
  /** Saved progress that looks lived-in: worlds 1–2 solved, Absorption begun; some perfect, some hinted. */
  async progress() {
    const { solve, HINT_SOLVE } = await import('/src/core/solver.ts');
    const { parseLevel } = await import('/src/core/level.ts');
    const { perfectMoves } = await import('/src/core/moves.ts');
    const levels = window.__pl.game.levels;
    const extra = [0, 2, 0, 1, 0, 0, 3, 0, 0, 0, 1, 0, 0, 2, 0, 0, 0, 1, 0, 0, 0];
    const hinted = new Set(['1-6', '2-4', '3-2']);
    const out = {};
    levels.slice(0, 21).forEach((l, i) => {
      const start = parseLevel(l);
      const perfect = perfectMoves(start, solve(start, HINT_SOLVE).solutions);
      const rec = { solved: true, hints: 0, moves: perfect + extra[i], perfect };
      if (l.par !== undefined) rec.best = l.par;
      if (hinted.has(l.id)) rec.movesHinted = true;
      out[l.id] = rec;
    });
    localStorage.setItem('puzzle-light:progress', JSON.stringify({ levels: out, last: '3-4' }));
  },
};
`;

async function page(browser, opts) {
  const p = await browser.newPage(opts);
  p.on('pageerror', (e) => console.error('page error:', e.message));
  // ?l= opens every level (a development switch), so no banner asks to open the next world.
  await p.goto(`${BASE}?l=1`);
  await p.evaluate(() => localStorage.clear());
  await p.reload();
  await p.waitForTimeout(600);
  await p.addScriptTag({ content: HELPERS });
  return p;
}

/** A saved best for one level, so the banner has something to compare with. */
const seedBest = (p, id, extra) =>
  p.evaluate(
    async ([id, extra]) => {
      const { solve } = await import('/src/core/solver.ts');
      const { parseLevel } = await import('/src/core/level.ts');
      const { perfectMoves } = await import('/src/core/moves.ts');
      const l = window.__pl.game.levels.find((x) => x.id === id);
      const start = parseLevel(l);
      const perfect = perfectMoves(start, solve(start).solutions);
      const levels = { [id]: { solved: true, moves: perfect + extra, perfect } };
      localStorage.setItem('puzzle-light:progress', JSON.stringify({ levels }));
    },
    [id, extra],
  );

async function stills(browser) {
  const wide = { viewport: { width: 825, height: 540 }, deviceScaleFactor: 2 };
  // [file, level, saved best (moves over perfect) or null, moves to waste this time]
  for (const [file, id, saved, waste] of [
    ['split-and-merge', '2-9', null, 0], // "Solved in 6 moves · ◎ perfect"
    ['white-again', '4-7', 3, 2], // "Solved in 4 moves · new best · perfect 2"
    ['return-trip', '5-8', 0, 2], // "Solved in 8 moves · best 6 · perfect 6"
  ]) {
    const p = await page(browser, wide);
    if (saved !== null) {
      await seedBest(p, id, saved);
      await p.reload();
      await p.waitForTimeout(600);
      await p.addScriptTag({ content: HELPERS });
    }
    await p.evaluate((id) => window.__media.open(id), id);
    await p.evaluate((w) => window.__media.solve(w), waste);
    await p.waitForTimeout(1400); // let the rings spread
    await p.screenshot({ path: path.join(OUT, `${file}.png`) });
    console.log(file, '→', await p.textContent('#solved-text'));
    await p.close();
  }

  const p = await page(browser, wide);
  await p.evaluate(() => window.__media.progress());
  await p.goto(`${BASE}?l=22`); // Absorption 4 is the current level
  await p.waitForTimeout(700);
  await p.evaluate(() => {
    window.__pl.select.open();
    document.activeElement?.blur(); // no focus ring in the picture
    document.querySelector('.world').scrollIntoView({ block: 'start' });
  });
  await p.waitForTimeout(300);
  await p.screenshot({ path: path.join(OUT, 'level-select.png') });
  await p.close();

  const phone = await page(browser, { viewport: { width: 390, height: 780 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await phone.evaluate(() => window.__media.open('4-1'));
  await phone.evaluate(() => window.__media.solve(0));
  await phone.waitForTimeout(1400);
  await phone.screenshot({ path: path.join(OUT, 'phone.png') });
  console.log('phone →', await phone.textContent('#solved-text'));
  await phone.close();
}

/** Warm Light, played with the mouse: two mirrors dragged from the tray, then turned. */
async function gif(browser) {
  const p = await page(browser, { viewport: { width: 640, height: 470 }, deviceScaleFactor: 1 });
  await p.evaluate(() => window.__media.open('1-6'));
  const plan = await p.evaluate(() => window.__media.plan());
  let n = 0;
  const frame = async (count = 1) => {
    for (let i = 0; i < count; i++) {
      await p.screenshot({ path: path.join(OUT, 'frames', `${String(n++).padStart(3, '0')}.png`) });
      await p.waitForTimeout(40);
    }
  };
  const box = await p.locator('#canvas').boundingBox();
  const geo = () => p.evaluate(() => ({ l: window.__pl.layout(), board: window.__pl.game.board }));
  const cellAt = (l, w, c) => ({ x: box.x + l.bx + ((c % w) + 0.5) * l.cell, y: box.y + l.by + (Math.floor(c / w) + 0.5) * l.cell });
  await frame(8);
  for (const { cell, piece } of plan) {
    const { l, board } = await geo();
    const slot = l.slots[0];
    const from = { x: box.x + slot.x + slot.w / 2, y: box.y + slot.y + slot.h / 2 };
    const to = cellAt(l, board.w, cell);
    await p.mouse.move(from.x, from.y);
    await p.mouse.down();
    for (let k = 1; k <= 9; k++) {
      await p.mouse.move(from.x + ((to.x - from.x) * k) / 9, from.y + ((to.y - from.y) * k) / 9, { steps: 2 });
      await frame();
    }
    await p.mouse.up();
    await frame(3);
    // Turn it the short way round: clicks turn clockwise, right-clicks back.
    const { board: b } = await geo();
    const positions = b.bends === 90 ? 4 : 8;
    const stride = 8 / positions;
    const d = ((((piece.rot - b.cells[cell].rot) / stride) % positions) + positions) % positions;
    const button = d <= positions / 2 ? 'left' : 'right';
    for (let k = 0; k < Math.min(d, positions - d); k++) {
      await p.mouse.click(to.x, to.y, { button });
      await frame(3);
    }
    await frame(2);
  }
  await p.mouse.move(box.x + box.width - 4, box.y + 4);
  await frame(22); // the solve: banner, rings, sparks
  console.log('gif →', n, 'frames,', await p.textContent('#solved-text'));
  await p.close();
}

(async () => {
  const browser = await chromium.launch();
  await stills(browser);
  await gif(browser);
  await browser.close();
})();
