# Puzzle Light

A calm browser puzzle about light. Rotate and place mirrors so every target
receives exactly its colour.

TypeScript + Vite + HTML5 Canvas, no engine, no runtime dependencies. Builds to
a static site.

## Develop

```bash
npm install
npm run dev        # http://localhost:5173  (?l=3 opens level 3)
npm test           # core engine + level checks (vitest)
npm run build      # typecheck + static build into dist/
```

## Controls

| action | mouse | touch |
|---|---|---|
| rotate clockwise | click | tap |
| rotate counter-clockwise | right-click or wheel | press and hold |
| place a piece | drag from the tray, or click the tray slot then a cell | same, with taps |
| move / remove a piece | drag it; drop off the board to return it | same |
| undo / redo / reset | `Z` / `Y` (or `Shift+Z`) / `R` | toolbar |
| previous / next level | `[` / `]` | toolbar |
| level select | `L` | grid button |
| hint | `H` | lightbulb |
| sound on/off | `M` | speaker (level select on phones) |
| play by keyboard | arrows move, Space turns or places, 1–9 pick a tray piece, Backspace returns it | |

## Level editor

Open it with the pencil button (or go to `#edit`):

* Paint pieces, set what the player may do with each one (fixed, turns,
  moves), and fill the tray.
* The solver checks the level as you build, and **Save** unlocks once a
  solution is verified.
* **Test** to play it, **Share** to copy a link that opens it for anyone.

## Docs

* [docs/DESIGN.md](docs/DESIGN.md): architecture, data model, level format, tracing
* [docs/ROADMAP.md](docs/ROADMAP.md): milestones and what's next
* [docs/DECISIONS.md](docs/DECISIONS.md): decision policy and log
