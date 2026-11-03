# Roadmap

We work milestone by milestone and review together at each one (no long
unattended runs). Every milestone ends with a commit and a push.

| # | Milestone | Status |
|---|-----------|--------|
| 1 | Core engine: grid, 8-dir tracing, emitters/targets/walls/mirrors, rotate, drag & drop, win, undo/redo/reset, JSON levels | **done** |
| 2 | Optics: additive mixing, prisms, splitters, filters, glass, black holes, portals | next |
| 3 | Solver + CI level validation | |
| 4 | Content: 40+ levels, 5 worlds, par, solver hints | |
| 5 | Level editor, test-play, solver check, share via URL hash | |
| 6 | Polish: glow/bloom, particles, rotation tweens, generative audio, level select + progress | |
| 7 | GitHub Pages deploy, README with GIF/screenshots | |

## M1: delivered

* `src/core/`: pure engine (no DOM). Board, token-based level format, fixpoint
  beam tracer, undo/redo history. Additive colour mixing at targets already
  works (colours are bitmasks), so M2 only adds pieces.
* `src/game/`: canvas renderer, responsive layout (tray below or beside the
  board), pointer input (tap / right-click / long-press / wheel / drag with live
  beam preview / tap-to-place), HUD with keyboard shortcuts.
* 6 tutorial levels in `src/levels/tutorial.json`, each checked by brute force
  to have a unique solution and covered by `tests/levels.test.ts`.
* 49 tests, including a fuzz property: tracing all emitters equals the OR of
  tracing each emitter alone.

## Decision log

Settled in M1 (open to revision; say so at a check-in):

1. **Mirrors have 8 orientations (22.5° steps).** One rule, `out = (rot − in) mod 8`,
   covers 45°, 90° and 135° bends plus pass-through and back-reflection.
2. **Targets absorb.** A beam feeds one target; splitters (M2) are how one source
   feeds several.
3. **Diagonal beams slip between diagonally-touching walls.** Only the destination
   cell matters.
4. **Undo coalesces** consecutive rotations of the same piece into one step.
5. **Win is continuous.** It's checked after every change; there's no fire button.
6. **Pre-placed free pieces get an empty tray slot** so the tray never reflows mid-level.
7. Working title "Puzzle Light"; all levels are freely navigable until M6 adds progress.

## M2 proposals (to confirm before building)

* **Prism** (`P`, rotatable): white light entering splits into R/G/B leaving at
  −45° / 0° / +45° relative to the incoming beam; single-channel light just
  bends by its channel's angle.
* **Splitter** (`S`, rotatable like a mirror): reflects *and* transmits.
* **Filter** (`F<c>`): passes only `beam AND colour`.
* **Glass** (`G`): passes light, but no piece can be placed on it.
* **Black hole** (`X`): absorbs light; can appear in the inventory as a
  placeable "beam stopper".
* **Portal** (`O<n>`, pairs share `n`): light entering one leaves the other in
  the same direction.
* Real loop tests (splitters make true cycles possible).

## Handoff notes

* Run `npm test` and `npm run build` before committing.
* In dev builds, `window.__pl` exposes `{ game, input, layout }` for browser
  automation (stripped from production).
* Levels must stay unique-solution; until the M3 solver lands, add the known
  solution to `SOLUTIONS` in `tests/levels.test.ts`.
