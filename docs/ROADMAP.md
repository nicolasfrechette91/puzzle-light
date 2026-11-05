# Roadmap

Milestones run back to back under the async decision policy in
[DECISIONS.md](DECISIONS.md). Each finished milestone is pushed to the
development branch **and to `main`**, which deploys to GitHub Pages, followed
by a short summary with the new decision entries.

| # | Milestone | Status |
|---|-----------|--------|
| 1 | Core engine: grid, 8-dir tracing, emitters/targets/walls/mirrors, rotate, drag & drop, win, undo/redo/reset, JSON levels | **done** |
| 2 | Optics: additive mixing, prisms, splitters, filters, glass, black holes, portals | **done** |
| 3 | Solver + CI level validation | **done** |
| 4 | Content: 40+ levels, 5 worlds, par, solver hints | **done** |
| 5 | Level editor, test-play, solver check, share via URL hash | **done** |
| 6 | Polish: glow/bloom, particles, rotation tweens, generative audio, level select + progress | **done** |
| 7 | GitHub Pages deploy, README with GIF/screenshots | **done** |
| 8 | Generator: seeded levels, unique, every piece matters, difficulty band | **done** |
| 9 | Daily puzzle: date seed, streak, time, spoiler-free share | **done** |
| 10 | Endless mode: easy / medium / hard | **done** |
| 11 | World 6 (8+ combination levels) + 5 expert bonus levels | **done** |
| 12 | Accessibility & feel: colour-blind mode, reduced motion, completion animations, focus | **done** |

## State of the project (v1.0.0)

Start here in a fresh session. Every milestone above is done, plus the
audit, the move tracker and the v1.0 wrap-up below. This is release 1.0.0;
its note is in [RELEASES.md](RELEASES.md).

**Live.** <https://nicolasfrechette91.github.io/puzzle-light/>. Every push to
`main` runs `.github/workflows/deploy.yml`: tests, `npm run levels`, build,
then Pages. To confirm a deploy, check that Actions run; some sandboxes can't
reach `github.io` directly. `ci.yml` runs the same checks on every branch.

**What's there.**
* 56 hand-made levels: six worlds of 8–9 plus five Expert levels that open
  with every ✦.
* Hints: the next step towards the nearest solution.
* The daily puzzle (from 2026-11-04) and endless mode at three tiers, both
  generated.
* The level editor, with a solver check and share links.
* The move tracker: counter, bests, perfect.
* Colour symbols, reduce motion, keyboard play and synthesised sound.

**Where things live.** [DESIGN.md](DESIGN.md) maps every file. In short:
* `src/core/` is pure, with no DOM, timers or randomness. It holds the
  engine, solver, hints, generator, daily/endless rules, moves and share codes.
* `src/game/` is the browser side. `main.ts` wires the modes together (the
  campaign, `#daily`, `#endless=`, `#play=`, `#edit`, `#test`).
* `src/editor/` is loaded on demand; `src/levels/` holds the worlds as JSON.

**Checks.**
* `npm test`: 258 tests across 22 files, about 4 s.
* `npm run levels`: all 56 levels, about 3 s. It shows solutions, minimum
  pieces, par, perfect and difficulty for each level.
* `npm run build`: typecheck plus the bundle. Main is 102 kB (35 kB gzip),
  the editor 19 kB, the workers 11–23 kB.
* Browser checks: in `npm run dev`, `window.__pl` exposes the game, input,
  layout, select, settings and stores. `scripts/media/capture.cjs` shows how
  to drive it with Playwright, including real mouse drags.

**Saved data** (localStorage, all through `src/game/local-store.ts`, each
store checking every field it reads, D-071):

| key | holds |
|---|---|
| `puzzle-light:progress` | per level (campaign id or `gen<v>-<tier>-<seed>`): solved, par best, hints, best moves, hinted, perfect; the last campaign level |
| `puzzle-light:settings` | colour symbols, reduce motion, move counter |
| `puzzle-light:sound` | `on` / `off` |
| `puzzle-light:daily` | first result per date, streak |
| `puzzle-light:daily-level:v<GENERATOR_VERSION>:<date>` | today's generated level and its perfect count |
| `puzzle-light:endless`, `puzzle-light:endless-history:v<GENERATOR_VERSION>` | next level and solved count per tier; easy's solution ids |
| `puzzle-light:draft`, `puzzle-light:my-levels` | the editor |

**How work is done.** Follow [DECISIONS.md](DECISIONS.md): decide routine
choices by its policy, log each one (the last entry is D-088), and ask the
owner only about scope or feel changes or anything irreversible. Before
committing, run `npm test`, `npm run build` and `npm run levels`. At the end,
push the development branch and `main`, confirm CI and the deploy, and post a
summary with the new entries.

**Things to know.**
* `GENERATOR_VERSION` (now 2) pins every daily and endless level. Bumping it
  changes all of them, and saved bests and the endless history for the old
  version are no longer used (D-050, D-073).
* The game works out perfect from the ≤50 solutions the hint solve keeps.
  `npm run levels` proves that's exact for the bundled levels, but an editor
  or shared level with more than 50 solutions could show a perfect that is
  too high.
* Test and shared levels don't save bests (D-081).
* Daily results from 2026-11-04 and 05 may predate the move tracker and use
  the old count (D-083).

## Next: ideas in priority order

Nothing here is promised; each would go through the decision policy. Items
that change the game's feel need the owner's yes first.

1. **The daily clock talks too much to screen readers.** The status line is
   `aria-live`, and the daily's time updates in it every second. Move the
   ticking time out of the live region, or announce it only on solve. Small,
   and a real accessibility fix (`dailyHooks` in `main.ts`, `index.html`).
2. **Perfect for any level.** Have the hint worker return the minimum moves
   over *all* solutions, not just the 50 it keeps, so editor and shared
   levels are exact too. Show perfect in the editor's solver panel, which
   already solves.
3. **Progress backup.** Export and import of the progress record as JSON,
   like editor levels, since localStorage is per device and per browser.
4. **Installable and offline.** A web manifest and a service worker that
   caches the build, so it works as a home-screen app. Cache-busting must
   respect D-072 (stale workers after a redeploy).
5. **Resume mid-level.** Keep the board (and the move count) of an unsolved
   level across a reload. Today a reload restarts the level at 0 moves.
6. **An Expert endless tier with portals.** D-052 left portals out of the
   generator because construction gets non-local. Needs measured generation
   times, like D-073.
7. **More hand-made content.** A seventh world or a second Expert pack, made
   the D-027 way and ordered by difficulty (D-025).
8. **Tidy-ups.** `docs/media/fan-and-fork.webp` isn't used anywhere. The
   `?l=` development switch opens every world, which is easy to forget.
9. **Translations.** UI strings are inline English in `hud.ts`, `main.ts`,
   `level-select.ts` and the editor; pulling them into one table comes first.

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

## M8: delivered

* `src/core/generate.ts`: builds the solution first, then blocks rival
  solutions and tidies walls (D-051). Seeded through `src/core/random.ts`, so a
  seed gives the same level in every engine (D-050). `GENERATOR_VERSION` pins
  the output, and a snapshot test fails if it changes unintentionally.
* Three tiers (D-052). Across 20 seeds each, every seed produced a level:

  | tier | difficulty | median | slowest |
  |---|---|---|---|
  | easy | 5–9 | 2 ms | 11 ms |
  | medium | 10–15 | 70 ms | 0.65 s |
  | hard | 14–19 | 0.36 s | 1.5 s |

* `npm run generate -- --tier hard --seed 5 [--count N] [--json]`.
* Solver is about 20% faster on boards without portals (D-053).
* Tests: PRNG, exact band check, determinism, every acceptance rule
  re-verified by the solver, and a pinned golden level.

## M9: delivered

* `#daily` (also from the Daily card at the top of the level select): one
  generated medium level per local date, the same for everyone (D-054).
* Moves, par (fewest actions) and visible play time; the first completion
  counts; streak and best streak (D-055, D-056).
* **Share result**: an emoji journey plus moves vs par, time, hints and
  streak, with no spoilers (D-057).
* `src/core/daily.ts` (pure: dates, seed, par, streak rules, share text),
  `src/game/generate.worker.ts` and `gen-client.ts`, `daily-store.ts`.
* HUD per-mode hooks (label, status, solved text, action), reused by M10.
* Tests: dates, determinism, the next 14 dailies are all valid, par counting,
  streak rules and share text. The browser flow was checked across two days
  with Playwright's clock.

## M10: delivered

* `#endless=easy|medium|hard` (also the **Endless** card in the level select,
  with the solved count per tier): a numbered sequence of generated levels per
  tier, the same for everyone, resuming where you stopped (D-058).
* **Skip** beside the status line, **Next puzzle** after a solve, and the next
  puzzle prefetched in the worker (D-059). No timer or score: the daily is the
  scored mode.
* `src/core/endless.ts` (pure), `src/game/endless-store.ts`, shared guarded
  storage helpers (`local-store.ts`).
* Phone header fits generated modes (D-060).
* Tests: seeds distinct per tier and number, determinism, the first levels of
  each tier are unique and in their difficulty band. Browser checks covered
  solving, skipping (a double click counts once), reload, tier switches and the
  phone layout.

## M11: delivered

* **World 6 "Confluence"**, 9 levels combining every piece, ordered by
  difficulty 10.9 → 21.7, with one ✦ level, Spare Parts (D-063).
* **Expert**, 5 bonus levels (difficulty 17–22) that open once all 6 ✦ are
  earned, shown as "Earn every ✦ to open (n / 6)" (D-062, D-064).
* **Hints solve in a worker** when a level loads, so even the heaviest levels
  never freeze the page (D-061).
* **Fix:** the level sheet scrolls again; its lower worlds were unreachable
  (D-065).
* 56 levels, all solver-verified; tests for the star gate; every new level
  was solved through hints in the browser.

## M12: delivered

* **Colour symbols** (Options → Colour symbols): red ▲, green ■, blue ●, with
  mixes shown by their parts, on emitters, targets, filters, beams and the
  editor's swatches (D-066).
* **Reduce motion** setting, following the system until changed (D-067).
* **Completion moments**: rings of light from each target when a level is
  solved; a sweep of light, an arpeggio and "World complete" in the banner for
  the last level of a world (D-068).
* **Keyboard focus** visible on every control; the current level tile has an
  inner ring; a scripted tab-through audit of each view (D-069).
* `src/game/settings.ts`; `colorSymbols` in the core, with tests.

All milestones in this plan are done.

## Audit (after M12)

An outside review of code quality, the generator, edge cases and performance.

**Fixed.** Each fix has a failing test first. The editor-touch and `?l=` fixes
live in DOM code, so they were reproduced and re-checked with a scripted browser.

* Hand-made share links with a mistyped `id`, `note` or `par` broke the HUD on
  every move, or the editor on "edit a copy"; they are now repaired or dropped
  (D-070).
* Corrupt or old localStorage no longer stops the game, the level select, the
  editor or today's daily from opening (D-071).
* Editor: importing JSON without an `id` made **Save** fail silently, and a
  non-string name or note broke every later edit (D-070).
* Editor on touch: drag-painting walls, glass or the eraser skipped the cell
  the drag started on.
* A worker that failed to load left "Looking for a hint…", "Preparing…" or
  "Solving…" up forever (D-072).
* `?l=1.5` crashed on load, and `?l=abc` opened every world; both now resume
  normally.

**Generator**, 50 dailies from #1 and endless #1–30 per tier, every level
re-verified (unique, in band, not solved at the start):

| set | made | difficulty min / median / max | time median / p90 / max |
|---|---|---|---|
| daily (medium) | 50 / 50 | 10.0 / 11.3 / 15.0 | 66 / 267 / 863 ms |
| endless easy | 30 / 30 | 5.0 / 7.0 / 8.6 | 0.6 / 2 / 5 ms |
| endless medium | 30 / 30 | 10.0 / 12.0 / 14.6 | 68 / 299 / 390 ms |
| endless hard | 30 / 30 | 14.2 / 16.2 / 18.3 | 337 / 580 / 1290 ms |

A wider scan (3,000 easy, 400 medium and 150 hard seeds) found no failures
and no level that starts solved.

**Performance** (headless Chromium with software rendering at 1280×800, so
only the ratios matter): tracing a 24×24 board with 2,665 beam segments takes
0.15 ms. A frame takes 13 ms on level 1-1, 23 ms on a 10×10 stress board and
49 ms on the 24×24 one. On 1-1, 11 of those 13 ms are the bloom, which scales
the whole viewport twice. Bundle: main 93.0 kB (31.5 kB gzip), editor 19.8 kB
(6.9 kB), workers 10.6–18.0 kB each, CSS 10.3 kB (2.9 kB).

## Generator v2 (after the audit)

`GENERATOR_VERSION` 2 (D-073 to D-075). Every daily and endless level
changed. Easy is 2–3 mirrors on 5×5 to 7×6 boards, difficulty 6–10, and never
repeats a solution. Every tier aims for the middle of its band, walls and
glass fill at most a quarter of the board, names come from 4,096 and don't
repeat within a tier, and a faster solver keeps hard under half a second at
p90. Same sample as the audit (50 dailies, endless #1–30 per tier):

| set | made | difficulty min / median / max | time median / p90 / max |
|---|---|---|---|
| daily (medium) | 50 / 50 | 10.8 / 12.1 / 13.9 | 75 / 201 / 396 ms |
| endless easy | 30 / 30 | 7.0 / 8.1 / 8.9 | 1 / 2 / 3 ms |
| endless medium | 30 / 30 | 11.0 / 12.0 / 13.9 | 58 / 132 / 184 ms |
| endless hard | 30 / 30 | 14.6 / 16.3 / 17.8 | 220 / 499 / 823 ms |

## After the audit

The owner asked for every audit recommendation, pushed to `main` in four
groups:

* **Generator v2** (above; D-073 to D-075).
* **Rendering** (D-076): the bloom covers only the board, and the page stops
  drawing once nothing moves; ambient motion settles 8 s after the last input.
  Frame time on 1-1 went from 13.2 to 5.8 ms (52.1 to 21.5 ms at 2×), and on the
  24×24 stress board from 51.8 to 44.4 ms. Idle frames dropped from 9–61 a
  second to 0.
* **Robustness** (D-077): the solver's corner assumption is a test, the shared
  partner array is frozen, stale hint solves are cancelled, and a bad
  `#edit=` link says why.
* **Cleanup** (D-078): piece matching through `slotKey`, one worker client,
  one storage module, one `$`, one `LONG_PRESS_MS`, and the dead code removed.

## Move tracker (after the audit)

Asked by the owner: a per-level move count that keeps the calm feel, built on
what existed (D-079 to D-083).

* **One count everywhere** (`src/core/moves.ts`, D-079): placing, moving or
  removing a piece, or a run of turns of one piece. Undo and reset never take
  moves back; starting the level again does. The daily now uses it too.
* **Perfect** (D-080): the solver's fewest moves, from the solutions the hint
  worker already finds. It replaces the daily's par. Campaign par (pieces, ✦)
  stays, because the two disagree (on 4-5 a perfect solve can miss ✦).
  `npm run levels` shows `perf` for every level.
* **Bests** (D-081) live in the progress record, keyed by level id or
  generator id. A hinted solve is marked, and any solve without hints
  replaces it.
* **Display** (D-082): a muted counter in the header (it leads the status line
  on phones), **Options → Move counter: after solving**, and "Solved in 9
  moves · best 7 · perfect 6" with a soft gold "new best" and "◎ perfect".
  Level tiles show the best, ◎ and a bulb for hinted bests.
* **Daily** (D-083): status "1:23 · perfect 6"; share "9 moves (perfect 6)".
* Tests: move counting (grouping, undo, reset, restart), perfect on small
  boards, played out on every bundled level, hinted and unhinted bests, and
  cleaning of the new stored fields. Browser checks covered the campaign,
  daily (first play and replay), endless, shared levels and the option, on
  desktop and phone.

## v1.0 wrap-up

Asked by the owner after the move tracker (D-084 to D-088):

* **Fix:** opening the daily or endless mode used to save that level as the
  campaign's last-played level, so a reload resumed at the first unsolved
  level instead. Only campaign levels can be "last played" now, and the mode
  changes before the level does (D-084). A test covers it, and the browser
  flow was checked (campaign → daily → endless → reload).
* **A key to the marks** under Options, and a tooltip on each mark (D-085).
* **The counter goes where it fits:** in the header when there is room, else
  leading the status line. This also fixed labels cut short at 521–760 px
  (D-086).
* **README:** a features list, current wording, and every changed image
  recaptured by `scripts/media/` (D-087).
* **v1.0.0:** the version, and a release note listing the milestones in
  [RELEASES.md](RELEASES.md). The session couldn't push the `v1.0.0` tag;
  the owner adds it (D-088).

## Open questions for the owner

* ~~Licence (D-046)~~: MIT, chosen by the owner (D-048).
* ~~First deployment~~: Pages uses the GitHub Actions source, and `main` was created from the development branch; every push to `main` deploys to https://nicolasfrechette91.github.io/puzzle-light/.
* ~~**Audit recommendations**~~: all done at the owner's request (D-073 to
  D-078); see "After the audit" above.

## Handoff notes

* See "State of the project" at the top first.
* Run `npm test`, `npm run build` and `npm run levels` before committing.
* In dev builds, `window.__pl` exposes `{ game, input, layout }` for browser
  automation (stripped from production).
* Every level must pass `npm run levels` (solvable, ideally unique). Sample
  levels also keep a designed solution in `tests/solutions.ts`.
* The tutorial levels use 45° bends early. That's fine for samples, but M4's
  world 1 must not.
