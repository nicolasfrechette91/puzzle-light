# Roadmap

We work milestone by milestone and review together at each one (no long
unattended runs). Every milestone ends with a commit and a push.

| # | Milestone | Status |
|---|-----------|--------|
| 1 | Core engine: grid, 8-dir tracing, emitters/targets/walls/mirrors, rotate, drag & drop, win, undo/redo/reset, JSON levels | **done** |
| 2 | Optics: additive mixing, prisms, splitters, filters, glass, black holes, portals | **done** |
| 3 | Solver + CI level validation | next |
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

## M2: delivered

* Splitter, prism, filter, glass, black hole and portal in the engine, token
  format, renderer and tray. Each piece glows with the light passing through it;
  black holes take on the colour they swallow; portal pairs are told apart by pips.
* Corner rule: diagonal light is pinched between two walls that touch at a corner.
* Portal pairs are validated at parse time (exactly two per pair id across grid
  and tray); a half-placed pair absorbs light rather than erroring.
* 6 sample levels in `src/levels/optics.json`, one per piece, each with a
  brute-force-checked unique solution.
* 82 tests: per-piece behaviour, a true splitter loop, corner pinching, portal
  pairing, prism recombination into magenta, and the fuzz property extended to
  every piece.

## Decision log

Confirmed with the user at the M1 review:

1. **Mirrors have 8 orientations (22.5° steps).** One rule, `out = (rot − in) mod 8`.
   **World 1 levels use only 90° bends; 45° bends arrive in world 2.**
2. **Targets absorb.** A beam feeds one target; splitters feed several.
3. **Corners pinch** (changed at review): a diagonal beam can't squeeze between
   two walls touching at a corner.
4. **Undo coalesces** consecutive rotations of the same piece.
5. M2 pieces approved as proposed. Filter = bitwise AND (white through red → red).
   Black holes may be tray pieces.

Also settled:

6. **Win is continuous**: there's no fire button.
7. **Pre-placed free pieces get an empty tray slot** so the tray never reflows.
8. **Prism has no rotation** (deviation from the M2 proposal, raised at the M2
   review): its fan follows the incoming beam, so rotation would be a no-op.
9. Working title "Puzzle Light"; levels freely navigable until M6 adds progress.

## M3 plan (to confirm)

* Solver over placements and rotations, pruned to cells light can reach, that
  counts solutions modulo irrelevant pieces (a piece counts only if removing or
  turning it changes the beams).
* `npm run levels` CLI: validates every level, reports solution count and
  minimum pieces, fails on unsolvable levels or a par below the minimum.
* Lint: world-1 levels' solutions contain no diagonal beams.
* GitHub Actions CI running tests, build and the level check.

## Handoff notes

* Run `npm test` and `npm run build` before committing.
* In dev builds, `window.__pl` exposes `{ game, input, layout }` for browser
  automation (stripped from production).
* Levels must stay unique-solution; until the M3 solver lands, add the known
  solution to `SOLUTIONS` in `tests/levels.test.ts`.
* The tutorial levels use 45° bends early. That's fine for samples, but M4's
  world 1 must not.
