# Puzzle Light

Read `docs/ROADMAP.md` first (status, decisions, next steps), then `docs/DESIGN.md`.

* `src/core/` must stay pure (no DOM, timers or randomness): the game, solver, editor and tests share it.
* Check in with the user at every milestone; commit and push at the end of each.
* Before committing: `npm test` and `npm run build`.
