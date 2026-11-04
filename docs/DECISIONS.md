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
