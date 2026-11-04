# Decisions

## Policy

Routine design and implementation choices are made without waiting for review,
using these rules in order:

1. **Player clarity beats mechanical depth.** If a rule can't be seen on screen,
   prefer a version that can.
2. **Every level must be solver-verified,** ideally with a unique solution.
3. **Prefer the simpler option** the solver can search faster.
4. **Keep the M1 data model and the single JSON format;** don't break saved levels.
5. **Respect decisions already made** (the log below).

Process:

* Each choice gets an entry below: question, options, choice, one-line reason.
* Genuinely close calls go to a reviewer subagent with the question, the options
  and this policy. Its answer is taken unless it conflicts with the policy, and
  it is logged with `by: reviewer`.
* The user is asked before: changing one of the user's decisions; anything that
  changes the game's feel or scope (new mechanics, removing features); deleting
  or rewriting history; anything irreversible.
* At the end of each milestone: push, then post a summary with the new entries.

`by:` says who decided: `user`, `claude` (applying the policy) or `reviewer`.

## Log

### D-001 · Mirror orientations (M1, by: user)
* **Question:** How many orientations does a mirror have?
* **Options:** 4 (45° steps, 90° bends only); 8 (22.5° steps, 45° bends too).
* **Choice:** 8. World 1 levels use only 90° bends; 45° bends arrive in world 2.
* **Reason:** One rule, `out = (rot − in) mod 8`, covers every bend, and the worlds ramp up to it.

### D-002 · Targets absorb (M1, by: user)
* **Question:** Does light stop at a target or pass through it?
* **Options:** Absorb; pass through.
* **Choice:** Absorb.
* **Reason:** One beam feeds one target; splitters are how one source feeds several.

### D-003 · Corners pinch diagonal light (M2, by: user)
* **Question:** Can a diagonal beam slip between two walls that touch at a corner?
* **Options:** Slip through; blocked.
* **Choice:** Blocked. Only walls pinch; one wall, or a wall next to any other piece, lets light through.
* **Reason:** It matches what the player sees: the walls look closed.

### D-004 · Undo groups rotations (M1, by: user)
* **Question:** Is each rotation tap its own undo step?
* **Options:** One step per tap; group consecutive rotations of the same piece.
* **Choice:** Group them.
* **Reason:** Rotating through 8 orientations shouldn't take 8 undos to reverse.

### D-005 · Optics pieces (M2, by: user)
* **Question:** What do the M2 pieces do?
* **Choice:**
  * Splitter: reflects and transmits.
  * Prism: splits R/G/B at −45°/0°/+45° of travel.
  * Filter: bitwise AND, so white through red comes out red.
  * Glass: passes light, but nothing can be placed on it.
  * Black hole: absorbs light, and can be a tray piece.
  * Portals: paired, and light keeps its direction.
* **Reason:** Approved as proposed.

### D-006 · Win detection is continuous (M1, by: claude)
* **Question:** Does the player trigger a win check?
* **Options:** "Fire" button; check after every change.
* **Choice:** Check after every change.
* **Reason:** Calm, immediate feedback; no extra UI.

### D-007 · Empty tray slots for pre-placed free pieces (M1, by: claude)
* **Question:** What happens to the tray when a pre-placed movable piece is picked up?
* **Options:** Create a slot on first pick-up; pre-create an empty slot at load.
* **Choice:** Pre-create.
* **Reason:** The tray never reflows mid-level.

### D-008 · Prism flip (M3, by: user)
* **Question:** Should the prism rotate, given its fan follows the incoming beam?
* **Options:** No rotation; a two-state flip.
* **Choice:** Two-state flip that swaps which side red and blue go to. Token `P0` / `P1`; bare `P` stays `P0`.
* **Reason:** Gives the prism a meaningful decision.

### D-009 · Per-level rotation restriction (M3, by: user)
* **Question:** How do world-1 levels guarantee 90° bends?
* **Options:** (a) restrict rotation per level; (b) design plus a lint only.
* **Choice:** (a): world-1 mirrors have 4 positions.
* **Reason:** Players never see a 45° bend before world 2.

### D-010 · Solver extras (M3, by: user)
* **Question:** What beyond the approved M3 plan?
* **Choice:** A difficulty score for ordering levels within a world, and a per-level time limit in the CI level check.
* **Reason:** Requested at the M2 review.

### D-011 · Free level navigation until progress exists (M1, by: claude)
* **Question:** Are levels locked until earlier ones are solved?
* **Options:** Lock; free navigation.
* **Choice:** Free navigation until M6 adds progress.
* **Reason:** Simplest while building; M6 revisits it.

### D-012 · `bends` level field (M3, by: claude)
* **Question:** How is the per-level rotation restriction (D-009) expressed?
* **Options:** A per-piece stride in tokens; a level-wide `"bends": 90`.
* **Choice:** Level-wide `"bends": 90` (default 45). Every 8-position piece (mirror, splitter, emitter) is limited to its 4 even orientations and turns 90° per tap. Odd orientations and prisms are rejected at parse time.
* **Reason:** One switch per level and no token changes; old levels are unaffected (policy 4); fewer positions to search (policy 3).

### D-013 · Walls, emitters and targets are never movable (M3, by: claude)
* **Question:** Should the solver support movable walls, emitters and targets? The token grammar allowed them, but no level used them.
* **Options:** Support them with extra search rules; reject them at parse time.
* **Choice:** Reject them (`#*`, `Er0*`, tray targets…). Rotatable emitters (`~`) stay allowed.
* **Reason:** A movable wall can pinch a corner without being lit, and a movable emitter matters wherever it sits. Both break the "only lit pieces matter" pruning (policy 3), and no saved level uses them (policy 4).

### D-014 · What makes two solutions different (M3, by: claude)
* **Question:** When are two solved boards the same solution?
* **Options:** Same piece positions; same light pattern; same *active* pieces.
* **Choice:** The same set of active player-controlled pieces: pieces that change the light reaching them.
  * Mirror or splitter: active when it deflects.
  * Prism: active when red or blue passes through.
  * Filter: active when it removes some colour.
  * Holes and portals: active when lit.
* **Reason:** A parked or idle piece shouldn't create a "new" solution, and the test is local and cheap.

### D-015 · Difficulty score (M3, by: claude)
* **Question:** How should the requested difficulty score (D-010) be defined?
* **Options:** Raw states explored; log2(states); log2(states) + decisions in the best solution.
* **Choice:** `log2(states explored) + decisions in the best solution`, to one decimal.
* **Reason:** It grows with both search breadth and solution length, and stays readable (a 2-piece level scores about 6–14).

### D-016 · Solver clock is injected (M3, by: claude)
* **Question:** How does a time limit fit a core that must stay pure?
* **Options:** Read the clock inside the solver; caller passes `now` and `deadline`.
* **Choice:** The caller passes them; the solver only counts states otherwise.
* **Reason:** Keeps `src/core` free of timers (CLAUDE.md), and tests use a fake clock.

### D-017 · Level-check outcomes (M3, by: claude)
* **Question:** What fails CI, and what only warns?
* **Choice:**
  * **Fail:** doesn't parse, already solved at start, no solution, search not finished within the time limit, par below the true minimum.
  * **Warn:** more than one solution, par above the minimum. `--strict` turns warnings into failures.
* **Reason:** Every level must be solver-verified, *ideally* unique (policy 2).

### D-018 · CI time limits (M3, by: claude)
* **Question:** What per-level limit should the level check use?
* **Choice:** 10 s per level (`--time` overrides) and a 15-minute job timeout as a backstop.
* **Reason:** The current hardest level solves in about 30 ms, so this leaves plenty of headroom while a runaway level fails fast.

### D-019 · Prism shows its flip (M3, by: claude)
* **Question:** How does the player see which way a prism sends red and blue (the fan is relative to the beam)?
* **Options:** A fixed icon; a wedge that points along the incoming beam, with its red edge on the side red leaves by.
* **Choice:** The wedge. It points east when unlit and in the tray.
* **Reason:** Player clarity beats mechanical depth (policy 1): the rule is readable straight off the board.

### D-020 · Rotate ring shows positions (M3, by: claude)
* **Question:** How does a player tell an 8-position mirror from a 4-position one (bends 90) or a 2-state prism?
* **Choice:** The dashed ring under a rotatable piece has one dash per available orientation.
* **Reason:** Policy 1, at almost no cost.

### D-021 · Solver correctness is tested against brute force (M3, by: claude)
* **Question:** How do we trust the pruned search?
* **Choice:** A test compares the solver with plain enumeration on 150 random 4×4 levels, most solvable by construction. Breaking the solver on purpose (dropping the portal-twin rule; never placing splitters) makes it fail.
* **Reason:** Every level must be solver-verified (policy 2), so the solver itself needs an oracle.

### D-022 · Known-solution table only for sample levels (M3, by: claude)
* **Question:** Do new levels also need hand-written solutions in tests?
* **Options:** Keep `tests/solutions.ts` for every level; only for the 12 samples.
* **Choice:** Only the samples (as regression checks on the solver). M4 levels are verified by `npm run levels` in CI.
* **Reason:** One source of truth that scales to 40+ levels (policy 3).

### D-023 · Five worlds for seven pieces (M4, by: reviewer)
* **Question:** Seven piece types plus the 45° unlock, but only 5 worlds. Which world introduces two things?
* **Options:**
  * A: 1 mirror · 2 splitter + 45° · 3 filter · 4 prism · 5 portal + late black hole.
  * B: 1 mirror · 2 diagonals · 3 splitter · 4 filter + prism · 5 portal + black hole.
  * C: 1 mirror · 2 splitter + 45° · 3 filter + black hole · 4 prism · 5 portal.
* **Choice:** C.
  * World 2 opens with 45° bends using plain mirrors; splitters follow in 90° layouts, then on diagonals.
  * World 3 teaches filters (with glass alongside), then the black hole from level 4.
* **Reason:** Policy 1. Filters and black holes share one visible idea, "this piece removes light", so only one world doubles up, and its two pieces explain each other.

### D-024 · What par means (M4, by: claude)
* **Question:** Par needs a level where you can use more pieces than necessary, which conflicts with unique solutions. How do they coexist?
* **Options:** No par at all; par on every level; par on chosen levels, with the fewest-piece solution unique.
* **Choice:** About one par level per world: 1-9, 2-8, 3-7, 4-5, 5-7. On those, longer solutions are allowed, but the fewest-piece solution must be unique and par equals the solver's minimum. The level check warns when a par level has no longer solutions (par would be meaningless).
* **Reason:** Policy 2 keeps the "ideally unique" spirit where it matters; par stays an optional challenge.

### D-025 · Level order within a world (M4, by: claude)
* **Question:** How are levels ordered inside a world (D-010)?
* **Options:** Pure difficulty score; teaching order; teaching levels first, then by score.
* **Choice:** The levels that introduce something new stay first. The rest are sorted by solver difficulty, and `npm run levels` flags large drops.
* **Reason:** Teaching beats are about clarity (policy 1); after that, the score is the most objective ordering available.

### D-026 · Sample levels become test fixtures (M4, by: claude)
* **Question:** What happens to the 12 M1/M2 sample levels?
* **Options:** Keep them in the game; delete them; move them to tests.
* **Choice:** Move them to `tests/fixtures/samples.json`, where they remain solver and hint regression cases.
* **Reason:** They were placeholders. Some use 45° bends early, which world 1 now forbids (D-001); as fixtures they still have value.

### D-027 · How levels were made unique (M4, by: claude)
* **Question:** Hand-designed boards often have unintended shortcuts. How are they removed?
* **Options:** Hand-iterate only; generate levels automatically; hand-design, then use a search that suggests the fewest blockers to add.
* **Choice:** Every level is drawn by hand around an intended idea and route. A scratch search then proposes the fewest walls or glass panes that remove the alternatives, and I pick among its suggestions. Crossing beams are used where possible: a filter or hole placed where another beam crosses would spoil that beam, which pins positions without clutter (e.g. 3-6 Crossfire).
* **Reason:** Hand-designed, as asked, while still meeting policy 2. Glass doubles as a visible "no building here".

### D-028 · Hints (M4, by: claude)
* **Question:** How do solver-powered hints work?
* **Choice:**
  * The level is solved lazily on the first hint request.
  * The hint picks the solution closest to the current board and shows its next unmet step, in the order light reaches the steps: place, move, turn, or remove a piece that's in the way.
  * It is drawn as a pulsing dashed outline plus a faint ghost of the result, with one line of text. Hints are counted per level.
* **Reason:** One step at a time keeps the puzzle the player's own, and following the beam matches how players think (policy 1).

### D-029 · HUD names the world (M4, by: claude)
* **Question:** What does the level counter show?
* **Choice:** "World · n" (e.g. "Reflection · 3"). Four levels that shared their world's name were renamed.
* **Reason:** Players see where they are in the progression; the full level select comes in M6.

### D-030 · Share-code format (M5, by: claude)
* **Question:** How is a level encoded in a URL hash?
* **Options:** A custom compact text format; deflate plus base64 (CompressionStream, async); minified JSON as base64url with a version prefix.
* **Choice:** `#play=1.<base64url(JSON)>`. Validated on decode, with readable errors. Typical length is 200–700 characters.
* **Reason:** Simplest, no dependencies, synchronous; it reuses the single JSON level format (policy 4), and the version prefix leaves room to change it later.

### D-031 · Editor modes live in the URL hash (M5, by: claude)
* **Question:** How do the campaign, editor, test play and shared levels relate?
* **Choice:** `#edit`, `#edit=<code>`, `#test`, `#play=<code>`, and nothing for the campaign. The pencil button opens the editor, returns from a test, or opens "edit a copy" of a shared level. The browser's back button moves between modes. The campaign keeps its place.
* **Reason:** Links and the back button just work; one page, no router dependency.

### D-032 · Editor interactions (M5, by: claude)
* **Question:** How does painting work?
* **Choice:**
  * Click paints the brush. Clicking a matching piece turns it, or changes its lock if the brush's lock differs.
  * Right-click erases. Dragging paints only walls, glass or erase. The wheel turns pieces. Touch: tap to paint, long-press to erase.
  * Locks the rules forbid are disabled in the lock control (D-013).
* **Reason:** Fast to build with, and impossible to create a piece the game rejects.

### D-033 · Solver check before saving (M5, by: claude)
* **Question:** What does "solver check before saving" mean in practice?
* **Choice:** The solver runs automatically in a Web Worker 350 ms after each edit, with an 8 s budget; a newer edit cancels the older search. **Save** is enabled only when a finished check of exactly the current state found at least one solution. Non-unique levels can be saved, with a warning (policy 2: "ideally" unique). Each found solution can be previewed on the board.
* **Reason:** The rule is enforced, not just advised, without ever blocking the UI.

### D-034 · Where custom levels are stored (M5, by: claude)
* **Question:** Where do drafts and saved levels live?
* **Choice:** `localStorage` (`puzzle-light:draft`, `puzzle-light:my-levels`), with every access guarded. JSON import and export cover moving levels between devices; share links cover sharing.
* **Reason:** Static site, no backend; storage failures degrade to "not remembered".

### D-035 · The editor loads on demand (M5, by: claude)
* **Question:** Should players download the editor?
* **Choice:** It is a dynamic `import()`, and the solver worker is its own chunk.
* **Reason:** The game stays about 54 kB of JS before gzip; the editor adds about 18 kB, the worker about 10 kB.

### D-036 · World gates (M6, by: reviewer)
* **Question:** Should levels be gated (revisiting D-011)?
* **Options:**
  * A: everything open.
  * B: strict sequence, each level unlocks the next.
  * C: world gates, all levels of an open world playable, the next world opening after N solves.
* **Choice:** C with a flat N = 6.
  * World 1 is open from the start; every level inside an open world stays open.
  * "Next level" follows the teaching order.
  * Par never gates anything.
  * Unlock state is derived from progress, so nothing changes in the level JSON.
* **Reason:** Policy 1. Later worlds assume earlier pieces, and one or two stuck levels never block progress. A simple "Solve 6 to open" line is visible in the level select and on the solved banner.

### D-037 · Bloom without canvas filters (M6, by: claude)
* **Question:** How should beams get a bloom-like glow?
* **Options:** `ctx.filter = 'blur()'`; WebGL; strokes into a quarter-resolution layer, upscaled with smoothing and additive blending.
* **Choice:** The low-resolution layer, drawn twice, on top of the layered additive strokes from M1.
* **Reason:** Works in every browser (canvas filters aren't universal), costs one small canvas, and needs no dependencies.

### D-038 · Particles (M6, by: claude)
* **Question:** Where do particles appear, and how many?
* **Choice:**
  * Sparks drift from targets receiving light, in the arriving colour: about 7 per second when the colour is right, 2.5 when it isn't, so wrong colours read as dimmer.
  * A soft burst from every target on solve.
  * Capped at 600; a quarter of the rate, and small bursts, with `prefers-reduced-motion`.
* **Reason:** Feedback where the player is looking, without noise elsewhere (calm).

### D-039 · Rotation tweens are display-only (M6, by: claude)
* **Question:** Should beams follow a rotating mirror's animation?
* **Options:** Animate the beam too; snap the beam and animate only the piece.
* **Choice:** The beam updates instantly. The piece eases (exponential, about 100 ms) along the shortest way, respecting symmetry: mirrors and splitters every 180°, emitters and prism wedges every 360°. No tween with reduced motion.
* **Reason:** The rules stay discrete and readable (policy 1); the motion only softens the change.

### D-040 · Sound (M6, by: claude)
* **Question:** What does the audio do, and how is it controlled?
* **Choice:**
  * **Synthesis only:** no audio files.
  * **Ambient:** a pad wandering through A minor pentatonic chords, occasional bells, generated reverb.
  * **Chimes:** one per colour, in the same scale, when a target becomes satisfied, plus an arpeggio of the targets' notes on solve.
  * **Effects:** soft ticks and taps for turning and placing.
  * **Control:** on by default but started only by a user gesture; one toggle (button or `M`) that is remembered; suspended while the tab is hidden.
* **Reason:** No copyrighted assets; notes keyed to colours tie sound to the light.

### D-041 · What progress records (M6, by: claude)
* **Question:** What is saved, and where does the game resume?
* **Choice:**
  * Saved: solved, fewest pieces (for par ✦) and fewest hints per level, plus the last level played.
  * Resume at the last level if it is open and unsolved; otherwise the next open unsolved level after it.
  * `?l=N` still jumps anywhere, for development.
* **Reason:** Enough for the level select and par marks; the hint count is kept for later use without being shown (calm, no shaming).

### D-042 · Phone toolbar (M6, by: claude)
* **Question:** Eight-plus toolbar buttons don't fit a 390 px phone next to the title.
* **Choice:** Under 760 px, the editor and sound buttons move into the level-select sheet (they stay in the toolbar during a test or a shared level). Under 420 px, previous/next are hidden; the level select and "Next level" cover navigation. The title truncates instead of overlapping.
* **Reason:** Touch targets stay at least 36 px and nothing overlaps.

### D-043 · Keyboard play (M6, by: claude)
* **Question:** Can the board be played without a pointer?
* **Choice:**
  * Arrow keys move a cursor ring.
  * Space or Enter turns the piece under it (Shift turns it back) or places the selected tray piece.
  * Number keys 1–9 select a tray slot; Backspace or Delete returns a piece to the tray.
  * Pointer input hides the cursor.
* **Reason:** Accessibility at small cost; it reuses the same tap logic, so the rules are identical.

### D-044 · Deployment (M7, by: claude)
* **Question:** How does the site get to GitHub Pages?
* **Options:** A `gh-pages` branch pushed by a script; the official Pages Actions (`upload-pages-artifact` + `deploy-pages`).
* **Choice:** The official actions, triggered on push to `main` and by hand. Tests and the level check run before the build, so a broken level never ships. The repository owner has to set Pages' source to "GitHub Actions" once.
* **Reason:** No extra branch to keep in sync, and nothing deploys from work-in-progress branches.

### D-045 · README media (M7, by: claude)
* **Question:** Which formats and sizes?
* **Choice:** Stills captured at 2× and saved as WebP (about 35 KB each; GitHub renders WebP), plus a 640 px gameplay GIF (about 390 KB) of a scripted mouse session on Warm Light, quantised to one shared palette so colours don't flicker.
* **Reason:** Crisp, light on the repository, and reproducible with Playwright.

### D-046 · No licence chosen (M7, by: claude)
* **Question:** `package.json` said `"license": "MIT"`, which I had set in M1 without asking.
* **Choice:** Removed it. Choosing a licence is the owner's call; the README makes no licence claim.
* **Reason:** Irreversible-ish and outside the brief, so it's left for the user.

### D-047 · The editor rejects levels that start solved (M7, by: claude)
* **Question:** A level whose beams already light every target passed the editor's check ("unique solution, 0 pieces") but fails `npm run levels`.
* **Choice:** `problem()` now reports it ("starts already solved"), which blocks test, share and save, matching the level check.
* **Reason:** One rule in both places (policy 2).

### D-048 · Licence: MIT (by: user)
* **Question:** Which licence (left open in D-046)?
* **Choice:** MIT, copyright Nicolas Frechette: a `LICENSE` file, `"license": "MIT"` in `package.json`, and a line in the README.
* **Reason:** The owner's choice.

### D-049 · Piece silhouettes, shared by board, palette and tray (post-M7, by: user + claude)
* **Question:** Several pieces looked alike in the editor palette and tray. Wall, glass and filter were all dark squares; target, black hole and portal were all circles; mirror and splitter were near-identical bars. How should every piece become recognisable at a glance?
* **Rules from the user:** a unique silhouette, recognisable in monochrome at 24 px, with colour only as a secondary cue. Icons must match the board. The palette is grouped Structure / Light / Optics / Special, with labels. Selected must look clearly stronger than hover.
* **Choice:**
  * **One drawer per piece**, used for both the board and the icons, so learning one teaches the other. The board pieces changed to the new silhouettes too:
    * Wall: a solid block with brick courses.
    * Glass: a thin frame with a diagonal shine.
    * Emitter: a box with a nozzle (the icon adds a beam with an arrowhead).
    * Target: a bullseye.
    * Mirror: a solid bar.
    * Splitter: the same bar in three dashes.
    * Prism: a solid wedge (the icon adds its red, green and blue fan).
    * Filter: a tinted frame with a funnel.
    * Black hole: a filled dark disc with a two-armed swirl (the icon adds a halo so it reads as solid on a dark panel).
    * Portal: a tall oval doorway with its pair dots stacked inside.
    * Eraser (palette only): a tilted two-tone block.
  * **Icons use a canonical orientation:** mirror and splitter on the diagonal, emitter and prism pointing east. They show the piece's kind, not its current rotation (a prism still shows which way it is flipped).
  * **Palette:** four labelled groups. Each tool has a visible label and a one-line tooltip (`title` and `aria-label`). Hover only lifts the border slightly; the selected tool gets a bright border, a glow, a tint and a bold label.
* **Verified:** every icon rendered at 24 px with a device pixel ratio of 1, converted to greyscale and upscaled ×4. All 11 stay distinct. The first pass caught three problems that were fixed: a filter that drew as a solid square (a funnel scale bug), a prism that read as a bowtie, and a black hole whose dark disc vanished.
* **Reason:** Policy 1 (player clarity): the piece's role is visible from its shape alone, on the board and in every menu.

### D-050 · The generator is pure and deterministic (M8, by: claude)
* **Question:** Where does procedural generation live, and how is "deterministic from a seed" guaranteed, given that daily puzzles (M9) must be the same for everyone?
* **Options:** A browser-only module using `Math.random`; core code with a seeded PRNG.
* **Choice:**
  * The generator lives in `src/core/generate.ts`, driven by `src/core/random.ts` (mulberry32 on 32-bit integer maths, uniform via rejection sampling). The PRNG never reads `Math.random` or the clock.
  * The difficulty band is checked with exact integers (`states × 2^decisions` against powers of two), not `Math.log2`, so no engine-specific rounding can pick a different level.
  * `GENERATOR_VERSION` goes into generated ids, and a snapshot test pins seed 1. Changing the output means bumping the version on purpose.
* **Reason:** Keeps `src/core` pure (CLAUDE.md), makes the output reproducible in tests, the CLI, workers and every browser, and needs no dependencies.

### D-051 · What the generator accepts (M8, by: claude)
* **Question:** How are "unique solution" and "no pieces that make no difference" made concrete?
* **Choice:**
  * **Unique:** the solver finds exactly one solution (D-014).
  * **Every piece matters:** the unique solution uses every tray piece, and every rotate-only piece is active in it. There are no decoys and no decorative fixed optics: every piece the construction placed ends up in the tray or rotate-only.
  * **Fair start:** not solved at the start.
  * **Difficulty:** inside the tier's band.
  * **Repair:** rival solutions are removed by blocking a cell only they use: a wall where the solution's light never goes, glass where it does (as in D-027). Then up to 4 walls that uniqueness doesn't need are tidied away.
  * **Names:** seeded "Adjective Noun" names from calm word lists.
* **Reason:** Policy 2 (solver-verified, unique), applied mechanically; and policy 1, since no piece exists without a purpose.

### D-052 · Generator tiers (M8, by: claude)
* **Question:** What should easy, medium and hard generate?
* **Choice:**

  | tier | board | bends | emitters | pieces | kinds | band |
  |---|---|---|---|---|---|---|
  | easy | 5×4 to 6×5 | 90° | 1, red/green/blue | 1–2 | mirrors | 5–10 |
  | medium | 6×5 to 7×5 | 45° | 1–2, incl. white | 2–3 | mirrors, splitters, filters | 10–15 |
  | hard | 6×5 to 7×5 | 45° | 1–2, often white | 3 | adds prisms and black holes | 14–19 |

  * In hard, half the pieces stay on the board as rotate-only.
  * Portals are left out.
  * Search budgets come from the band: a final search past `2^(hi − fewest pieces)` states can't be in band, so it stops there.
* **Reason:** Policy 3 (prefer what the solver searches fast), and measured. The first hard spec (up to 8×6, 3–4 pieces) took a 4 s median and 34 s worst case per level. The chosen one takes 0.36 s median and 1.5 s worst, still at difficulty 14–19 (the World 3–5 finales score 14–19). Portals make construction non-local, which can wait until an "expert" tier is wanted.

### D-053 · Solver fast path for portal-free boards (M8, by: claude)
* **Question:** Profiling showed `portalPartners` taking 14% of solver time, rebuilt on every trace.
* **Choice:** Boards without portals share one read-only "unpaired" array, the pairing uses fixed arrays instead of a Map, and the solver skips its portal-twin rule when the level has no portals at all. Results are unchanged: the same state counts, and the brute-force cross-check passes.
* **Reason:** About 20% faster solving, which makes in-browser generation and hints cheaper.

### D-054 · Daily puzzle: date, seed and tier (M9, by: claude)
* **Question:** What makes the daily "one level per day, the same for everyone"?
* **Options:** A UTC date (everyone switches at the same instant, mid-day for many players); the local calendar date (as Wordle does).
* **Choice:**
  * **Date:** the player's local calendar date. Puzzle #1 is 2026-11-04.
  * **Seed:** `FNV-1a("puzzle-light/daily/v<GENERATOR_VERSION>/<date>")` (D-050).
  * **Tier:** medium every day (about 70 ms median to generate), built in a Web Worker and cached in localStorage per date and generator version.
  * **Streak:** counts consecutive dates; it lapses after a missed day, and the best streak is kept.
* **Reason:** "Today's puzzle" matches each player's own today, and everyone shares the same puzzle per date. Medium is fast to generate and fair for a daily habit.

### D-055 · Daily moves, par and result (M9, by: claude)
* **Question:** What do "moves" and "par" mean, and which play counts?
* **Choice:**
  * **Moves:** every board action counts: one placement, move or return, one rotation step, one undo, redo or reset. Hints are not moves, but they're counted and shown (💡).
  * **Par:** the fewest actions that solve it. Each tray piece placed, plus the shortest turn to its orientation, plus the shortest turn for each rotate-only piece (`movesPar`).
  * **Which play counts:** only the first completion of a date. Replays are allowed and say so, but don't change the result or streak.
* **Reason:** Easy to explain and countable without hidden rules (policy 1); par is computed from the solver's unique solution (policy 2).

### D-056 · Daily timer (M9, by: claude)
* **Question:** When does the completion time start, and what does it include?
* **Choice:** It starts with the first move, not when the page opens, and only time with the tab visible counts. It stops on solve.
* **Reason:** Reading the board before moving shouldn't feel rushed (calm), and a background tab shouldn't count.

### D-057 · Spoiler-free share (M9, by: claude)
* **Question:** What goes in the shared result?
* **Choice:**
  ```
  Puzzle Light · Daily #3
  ⬛⬛🟨🟨⬛🟨🟨🟨
  🟩
  9 moves (par 5) · 1:23 · 💡1 · 🔥3
  <link to #daily>
  ```
  * One square per move shows how many targets were lit after it: none, some or all. Rows of 8, capped at 40 squares.
  * Meeting par shows `✦ par`.
  * The native share sheet is used on touch devices, the clipboard elsewhere (the button confirms "Copied ✓").
* **Reason:** Like Wordle, it shows the journey and never the answer: nothing about positions or pieces.

### D-058 · Endless mode: a numbered sequence per tier (M10, by: claude)
* **Question:** Where do endless levels come from, and what does a player resume after a reload?
* **Options:**
  * A random seed per level (nothing to resume; can't be reproduced or tested).
  * A numbered sequence per tier (Easy #1, #2, …, the same for everyone).
* **Choice:** a numbered sequence per tier.
  * **Seed:** level *n* of a tier uses `FNV-1a("puzzle-light/endless/v<GENERATOR_VERSION>/<tier>/<n>")`.
  * **Tiers:** easy, medium and hard are the generator tiers (D-052), each defined by its difficulty-score band, so the tier you pick is the difficulty you get.
  * **Saved:** the number to play next per tier, the solved count per tier and the last tier, in localStorage. Reloading reopens the same puzzle.
  * **Fallback:** a seed that yields no level is passed over.
* **Reason:** It's deterministic and testable (a test checks validity and difficulty bands for the first levels of each tier), it resumes exactly, and needs no randomness anywhere.

### D-059 · Endless mode: skip, counts and pace (M10, by: claude)
* **Question:** How does a player move on, and what is tracked?
* **Choice:**
  * **Skip:** a labelled **Skip** pill beside the status line while unsolved (N or ] also skip). It moves on with no penalty; a skipped number isn't offered again.
  * **After a solve:** "Next puzzle".
  * **Tracked:** only the solved count per tier, shown on the tier pills in the level select. No timer, streak or par: the daily is the scored mode, endless is for unwinding.
  * **Hints:** work as in the campaign.
  * **Speed:** the next puzzle is generated in the worker while the current one is played. Hard took about 0.5 s cold, and the next appears at once.
* **Reason:** Calm and clear (policy 1). A text button explains itself, where a new toolbar icon would not. On phones the toolbar had no room for another button either.

### D-060 · Phone header in generated modes (M10, by: claude)
* **Question:** "Endless · Medium #1" plus a generated name didn't fit the phone header.
* **Choice:**
  * **Prefix:** the "Endless · " prefix is hidden at ≤420 px, leaving "Medium #1".
  * **Names:** a name that still doesn't fit ends in an ellipsis instead of being cut mid-letter (this also fixes long campaign names).
* **Reason:** The tier and number identify the puzzle; the mode is clear from the level select and the Skip button.

### D-061 · Hints solve in a worker (M11, by: claude)
* **Question:** The new finale needs a 2 s solve (longer on phones), and the first hint used to solve on the main thread, freezing the page. Cap level difficulty, or move the work?
* **Options:** keep every level under ~75k states; precompute solutions into the level data (a second format); solve in a Web Worker.
* **Choice:** a dedicated hint worker solves each level as it loads.
  * **Early hint:** a hint asked for before the solutions arrive shows "Looking for a hint…" and appears as soon as they do.
  * **Fallbacks:** without a worker (tests, Node) or on a worker error, the game still solves synchronously.
  * **Shared code:** both workers now use one small `WorkerClient`.
* **Reason:** Hard levels stay possible without a second level format (policy 4). It's measured: on Convergence the hint arrived after 1.3 s, and the page kept drawing throughout (67 frames, worst 30 ms).

### D-062 · What "all stars" opens (M11, by: reviewer)
* **Question:** "5 bonus expert levels unlocked after all stars": the only star in the game is ✦ (par met), and there is one ✦ level per world.
* **Options:**
  * A: every ✦ earned.
  * B: every level solved and every ✦ earned.
  * C: every level solved.
* **Choice:** A. The Expert pack opens once all 6 ✦ in worlds 1–6 are earned.
  * **Lock text:** the level select shows "Earn every ✦ to open (n / 6)", and the last campaign banner says the same.
  * **Data:** it is computed from saved progress (a `gate: "stars"` field on the pack), so nothing new is stored.
* **Reason:** It's the literal reading, and ✦ is already counted on every world header. B adds a requirement the owner didn't ask for, and C ignores the stars. Earning all six still means reaching World 6.

### D-063 · World 6 "Confluence" (M11, by: claude)
* **Question:** What should the combination world contain, and in what order?
* **Choice:** 9 levels, each pairing ideas from different worlds, ordered by solver difficulty (10.9 → 21.7):

  | level | combines |
  |---|---|
  | Reunion | prism + mirror |
  | Folded Spectrum | portal twin + prism + mirror |
  | Leak | mixing splitter + black-hole plug |
  | Yellow Fan | a filter before a prism fans only red and green |
  | Spectrum Gate | portal + prism flip + mirrors |
  | Crossroads | a 22.5° splitter sends two colours diagonally at once |
  | Switchyard | two beams share one portal, routed by rotate-only mirrors |
  | Spare Parts | the world's ✦ level: par 2 with three pieces in the tray |
  | Convergence | splitter, filter, portal, prism and mirrors |

  Every level has one solution (Spare Parts: one fewest-piece solution). It opens after 6 solves in Wormholes, like every world (D-036).
* **Reason:** Each level adds one combination, so the world teaches without new rules (policy 1). The checker proves uniqueness (policy 2), and the slowest solve is 2 s against the 10 s CI limit.

### D-064 · The five Expert levels (M11, by: claude)
* **Question:** What makes an Expert level, given its solves must stay fast?
* **Choice:** Each turns on one insight the campaign only hints at, at difficulty 17–22, with every solve under 2.5 s:

  | level | insight |
  |---|---|
  | Magenta Fork | the "leaked" half of a mixed beam is the one you need, split again by a prism |
  | Eclipse | the plug can only go where it misses the prism's other beams |
  | Yellow Prism | a prism fed yellow fans red and green only, and the flip decides which side red takes |
  | Three Ways Through | three beams enter one portal from three sides |
  | Spectrum Relay | each colour takes its own portal, filtered at the exit, and all three meet at one white target |

  I considered a version of Yellow Prism with a tray portal (1.3M states), but it was too slow for hints and CI.
* **Reason:** Depth through insight rather than size keeps the levels clear and quick to verify (policies 1–3).

### D-065 · Level sheet scrolls (M11, by: claude)
* **Question:** With 7 worlds the level sheet grew past the screen and its lower worlds couldn't be reached; its `max-height: 100%` followed the content inside the centred grid.
* **Choice:** cap the sheet at the viewport height (`100dvh` minus the margin), with a scrolling body.
* **Reason:** A plain layout bug; the fix changes nothing else.

### D-066 · Colour-blind mode: a shape per light channel (M12, by: claude)
* **Question:** Which pattern or symbol should stand for each colour?
* **Options:** letters (R, G, B, Y, C, M, W); one arbitrary symbol per colour; one shape per channel, combined for mixes.
* **Choice:** a shape per channel: red ▲, green ■, blue ●, and a mix lists its parts (yellow ▲■, magenta ▲●, cyan ■●, white ▲■●).
  * **Where:** on a small dark badge at the top-left of every emitter, target and filter (board and tray), on badges spaced along every beam, and on the editor's colour swatches.
  * **How:** one toggle, **Colour symbols**, in the level sheet's Options row, saved locally.
* **Reason:** The symbols follow the game's own rule that colours add up (policy 1): a target marked ▲■ visibly wants the ▲ beam plus the ■ beam. They need no language and stay distinct in greyscale (checked with a greyscale screenshot). They sit beside the piece silhouettes (D-049) rather than replacing them.

### D-067 · Reduce motion is a setting (M12, by: claude)
* **Question:** Should motion follow only the system preference, as before?
* **Choice:** an Options toggle, **Reduce motion**, that follows the system until changed (the label says "(system)") and updates live when the system preference changes. When on:
  * the board doesn't fade in, pieces don't animate turning, and no sparks fly;
  * a solve shows a soft glow in place instead of spreading rings, and a completed world gets a gentle brightening instead of a sweep;
  * every CSS animation and transition is off.
* **Reason:** Some players want calm motion without changing their whole system; the default still respects the system.

### D-068 · Level-complete and world-complete moments (M12, by: claude)
* **Question:** How much should completing a level or a world celebrate?
* **Choice:**
  * **A level:** two rings of each target's colour spread from it, alongside the existing sparks, chime and bright beams.
  * **The last unsolved level of a world:** a slow band of warm light crosses the board, a rising four-note arpeggio follows the solve chime, and the banner adds "· Reflection complete".
* **Reason:** It stays calm (soft light, no shaking or flashing) while making a finished world feel distinct; it all fits in the existing render loop.

### D-069 · Keyboard focus visible everywhere (M12, by: claude)
* **Question:** How do we make sure every control shows keyboard focus?
* **Choice:**
  * **One rule:** a single global `:focus-visible` outline for every focusable element.
  * **The current level tile:** marked with an inner ring, so it can't be mistaken for focus (an outer ring).
  * **The editor's name field:** now shows the outline too.
  * **The board:** keeps its keyboard cursor ring.
  * **Audit:** a scripted check tabs through the play view, the level sheet and the editor; every element showed a visible ring.
* **Reason:** One rule can't miss new controls, and the audit proves it.
