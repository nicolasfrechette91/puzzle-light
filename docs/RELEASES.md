# Releases

## v1.0.0

A calm browser puzzle about light: 56 solver-verified levels, a daily
puzzle, endless mode, a level editor and a move tracker.

Play: <https://nicolasfrechette91.github.io/puzzle-light/>

**Milestones**

- M1  Core engine: grid, 8-direction tracing, mirrors, drag and drop, undo, JSON levels
- M2  Optics: colour mixing, splitters, prisms, filters, glass, black holes, portals
- M3  Solver and CI level validation
- M4  Content: five worlds, par levels, hints
- M5  Level editor: test play, solver check, share links
- M6  Polish: bloom, particles, tweens, synthesised sound, level select, progress
- M7  GitHub Pages deployment and README
- M8  Seeded level generator
- M9  Daily puzzle: streak, time, spoiler-free share
- M10 Endless mode: easy, medium, hard
- M11 World 6 "Confluence" and the Expert pack
- M12 Accessibility and feel: colour symbols, reduce motion, completion moments, focus
- Audit and follow-ups: hardened saved data, generator v2, drawing only while
  something moves, robustness, one way to do each thing
- Move tracker: one move count, perfect scores, saved bests
- v1.0 wrap-up: resume fix, a key to the marks, README and media

Every decision is logged in docs/DECISIONS.md (D-001 to D-088);
docs/ROADMAP.md says where things stand and what could come next.

To tag it (git, or GitHub → Releases → Draft a new release with tag `v1.0.0`
on `main`, pasting the text above):

```bash
git tag -a v1.0.0 -m "Puzzle Light 1.0.0" main && git push origin v1.0.0
```
