# Puzzle Light

Read `docs/ROADMAP.md` first (status, next steps), then `docs/DECISIONS.md` (policy + log) and `docs/DESIGN.md`.

* `src/core/` must stay pure (no DOM, timers or randomness): the game, solver, editor and tests share it.
* Decide routine choices with the policy in `docs/DECISIONS.md` and log each one there.
* At the end of each milestone: push the development branch **and `main`** (main deploys to GitHub Pages), confirm the deploy, then post a summary with the new decision entries.
* Before committing: `npm test`, `npm run build` and `npm run levels`.
