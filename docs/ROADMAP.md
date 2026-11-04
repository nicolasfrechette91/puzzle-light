# Roadmap

We work milestone by milestone and review together at each one (no long
unattended runs). Every milestone ends with a commit and a push.

| # | Milestone | Status |
|---|-----------|--------|
| 1 | Core engine: grid, 8-dir tracing, emitters/targets/walls/mirrors, rotate, drag & drop, win, undo/redo/reset, JSON levels | **done** |
| 2 | Optics: additive mixing, prisms, splitters, filters, glass, black holes, portals | **done** |
| 3 | Solver + CI level validation | **done** |
| 4 | Content: 40+ levels, 5 worlds, par, solver hints | **done** |
| 5 | Level editor, test-play, solver check, share via URL hash | **done** |
| 6 | Polish: glow/bloom, particles, rotation tweens, generative audio, level select + progress | **done** |
| 7 | GitHub Pages deploy, README with GIF/screenshots | **done** |

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

## Decisions

All design decisions, with the policy used to make them, live in
[DECISIONS.md](DECISIONS.md).

## M3: delivered

* **Prism flip** (D-008, D-019): `P0`/`P1`. The wedge points along the incoming
  beam and its edges show where red and blue go.
* **`"bends": 90`** (D-009, D-012): 4 positions for 8-position pieces; the
  rotate ring shows one dash per position (D-020).
* **`src/core/solver.ts`**: exhaustive, beam-guided search. It reports the
  solution count, the best solutions, the minimum pieces, the states explored
  and a difficulty score (D-014, D-015). It takes node, time and early-stop
  budgets; the clock is injected (D-016).
* **`npm run levels`**: solves every level with a per-level time limit
  (default 10 s). It fails on unsolvable, timed-out, impossible-par or
  already-solved levels, and warns on multiple solutions or a generous par
  (D-017, D-018).
* **CI** (`.github/workflows/ci.yml`): tests, typecheck + build, level check.
* **Tests:** 110, including the solver checked against brute force on 150
  random levels (D-021).

## M4: delivered

* 42 levels in `src/levels/world1..5.json` (D-023):
  * Reflection (9): mirrors, 90° only.
  * Division (9): 45° bends, splitters.
  * Absorption (8): filters, glass, black holes.
  * Spectrum (8): prisms.
  * Wormholes (8): portals.
* Every level passes `npm run levels`. Non-par levels have exactly one
  solution; par levels have exactly one fewest-piece solution (D-024).
* Levels are ordered by teaching beats, then by solver difficulty (D-025).
* Hints (`src/core/hint.ts`, D-028): lightbulb button or `H`. Following hints
  alone solves every level checked in the browser.
* World 1 is enforced as `bends: 90` by a test; sample levels moved to
  `tests/fixtures` (D-026).

## M5: delivered

* `#edit` opens the editor (pencil button in the game):
  * Tools: paint pieces, colours, portal pairs, lock mode and the tray.
  * Level settings: board size, note, par, 90° bends.
  * Undo/redo, with live beams while you build.
* The solver runs in a Web Worker after every edit. **Save** needs a verified
  solution (D-033), and each solution can be previewed on the board.
* **Test play** (`#test`, or `T`) and back. **Share** copies a
  `#play=1.<code>` link (D-030); shared levels can be edited as a copy.
* My levels (localStorage), JSON import/export, auto-saved draft (D-034).
* The editor is lazy-loaded (D-035). Its model is DOM-free and unit-tested
  (`tests/editor.test.ts`); share codes are tested in `tests/share.test.ts`.

## M6: delivered

* **Glow:** a bloom layer (D-037), particles at lit targets with a burst on
  solve (D-038), rotation tweens (D-039) and a level fade-in, all reduced under
  `prefers-reduced-motion`.
* **Sound** (`src/game/audio.ts`, D-040): synthesised ambient, colour chimes
  and small effects; toggle with the button or `M`.
* **Level select** (`L` or the grid button) with per-world progress and par
  marks. Worlds unlock after 6 solves (D-036); progress lives in localStorage
  and the game resumes where you left off (D-041).
* **Responsive toolbar** (D-042) and keyboard play (D-043).
* Unlock and resume rules are tested in `tests/progress.test.ts`.

## M7: delivered

* `.github/workflows/deploy.yml`: test, check levels, build, deploy to Pages
  on push to `main` (D-044). It needs Pages' source set to GitHub Actions. The
  production build was checked served from a `/puzzle-light/` sub-path (game,
  editor chunk and solver worker).
* README with a gameplay GIF and screenshots (D-045). Media were captured with
  Playwright from the dev server (stills at 2× as WebP; the GIF from a scripted
  session, assembled with Pillow).

## Open questions for the owner

* Licence (D-046).
* There is no `main` branch yet: the development branch is the only (and default) branch. Create `main` from it, or run the deploy workflow by hand, after enabling Pages with the GitHub Actions source.

## Handoff notes

* Run `npm test` and `npm run build` before committing.
* In dev builds, `window.__pl` exposes `{ game, input, layout }` for browser
  automation (stripped from production).
* Every level must pass `npm run levels` (solvable, ideally unique). Sample
  levels also keep a designed solution in `tests/solutions.ts`.
* The tutorial levels use 45° bends early. That's fine for samples, but M4's
  world 1 must not.
