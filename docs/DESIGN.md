# Puzzle Light — design

Working title. A calm light-and-mirrors puzzle: route coloured beams so every
target receives exactly its colour.

## Principles

1. **The core is pure.** `src/core/` has no DOM, no timers and no randomness. The
   game, the solver (M3), the editor (M5) and the CLI checks all call the same
   `trace()` on the same `Board`, so "what the player sees" and "what the solver
   proves" cannot drift apart.
2. **State == level format.** A board mid-play serialises to exactly the same
   JSON as a level, so saving, sharing (URL hash) and editing need one format.
3. **Deterministic tracing.** Tracing computes a fixpoint over
   `(cell, direction) → colour mask`. The result does not depend on the order
   emitters are processed in, so it is reproducible and cheap to compare.

## Project layout

```
index.html              Vite entry (HUD markup + canvas)
src/
  main.ts               bootstrap: levels → Game → input/render/HUD
  style.css
  core/                 pure, deterministic, Node-testable
    dir.ts              8 directions, DX/DY, reflect()
    color.ts            3-bit RGB masks, token letters, display colours
    piece.ts            Piece kinds, lock modes, per-kind metadata
    board.ts            Board: grid + inventory, place/move/pickUp/rotate, clone, key
    level.ts            compact JSON level format ⇄ Board
    trace.ts            beam tracing → per-edge colour masks, target status, solved
    history.ts          undo/redo stack with coalescing
    (M3) solver.ts      backtracking solver reusing board.ts + trace.ts
  game/                 browser-only
    game.ts             controller: level, board, history, trace, win state
    layout.ts           responsive geometry + hit testing
    input.ts            pointer/keyboard → game actions (tap, drag, long-press)
    render.ts           canvas drawing
    hud.ts              DOM toolbar, notes, win banner
  levels/
    index.ts            level packs (JSON imported at build time)
    tutorial.json       M1 sample levels (replaced by worlds in M4)
tests/                  vitest, runs the core in Node
scripts/                (M3) CLI: solve/validate all levels for CI
docs/                   this file + ROADMAP.md
```

## Grid and directions

* Board is `w × h` cells, row-major; `index = y * w + x`; y grows **down**.
* 8 directions, clockwise on screen, starting East:

  | d | 0 | 1  | 2 | 3  | 4 | 5  | 6 | 7  |
  |---|---|----|---|----|---|----|---|----|
  |   | E | SE | S | SW | W | NW | N | NE |

* Beams travel centre-to-centre. Diagonal beams pass between two
  diagonally-touching walls (only the destination cell matters). Beams cross
  each other without interacting.

## Pieces

Every non-empty cell holds exactly one `Piece`:

```ts
interface Piece {
  kind: 'wall' | 'emitter' | 'target' | 'mirror' /* M2: prism, splitter, filter, glass, hole, portal */;
  rot: number;    // orientation step, meaning per kind
  color: number;  // 3-bit RGB mask (emitter output / target requirement / filter)
  lock: 'fixed' | 'rotate' | 'free';
}
```

* `fixed` — part of the puzzle, cannot be touched.
* `rotate` — stays in place, tap to rotate.
* `free` — can be dragged, rotated and returned to the inventory. Pieces placed
  from the inventory are always `free`.

**Mirrors** are double-sided lines at angle `rot × 22.5°` (clockwise from +x),
so 8 orientations cover all 8 beam directions with a single rule:

```
out = (rot − in) mod 8
```

`rot 0` is `—`, `2` is `\`, `4` is `|`, `6` is `/`; odd values are the 22.5°
in-betweens that bend a beam by 45°. A beam parallel to a mirror passes along
it (the formula gives `out = in`), a beam perpendicular to it is sent back.

## Colour

Colours are additive 3-bit masks: `R=1, G=2, B=4`; mixing is `OR`, filtering is
`AND`. Letters: `r g b y(rg) m(rb) c(gb) w(rgb)`. A target is satisfied when the
OR of everything arriving equals its colour **exactly** (red+green → yellow
satisfies a yellow target; red+green+blue does not).

## Level format (compact JSON)

```json
{
  "id": "t-03",
  "name": "Around the Wall",
  "grid": [
    ".   .   .   .   .   .   .",
    "Er0 .   .   #   .   .   Tr",
    ".   .   .   #   .   .   ."
  ],
  "inv": { "M": 2 },
  "par": 2,
  "note": "Light can travel diagonally too."
}
```

`grid` rows are whitespace-separated tokens (padding is free, so columns can be
aligned). Token grammar: `Kind [colour] [digit] [lock]`

| token  | meaning                                      |
|--------|----------------------------------------------|
| `.`    | empty floor (pieces can be placed here)      |
| `#`    | wall (absorbs light)                         |
| `Er0`  | emitter, red, facing direction 0 (E)         |
| `Tg`   | target wanting green                         |
| `M2`   | mirror at rot 2 (`\`), fixed                 |
| `M2~`  | … rotatable in place                         |
| `M2*`  | … free (movable)                             |

`inv` maps a token (lock omitted) to a count. Unknown tokens, ragged rows or
out-of-range digits are rejected by the parser. M2 adds `P`rism, `S`plitter,
`F`ilter, `G`lass, `X` black hole and `O` portal using the same grammar.

## Beam tracing

```
out[cell*8 + dir]  : colour mask of light leaving `cell` towards `dir`
hit[cell]          : colour mask absorbed at `cell` (targets, walls, emitters)
```

1. Seed: every emitter emits its colour from its own cell.
2. `emit(cell, dir, mask)` adds only the bits not already in `out[cell,dir]`
   and queues them. Every optical interaction acts per colour channel, so
   propagating only *new* bits is exact.
3. Pop `(cell, dir, mask)`, step to the neighbour, and let the piece there
   decide: floor passes, mirror reflects, wall/emitter/target absorb into
   `hit`, leaving the board ends the beam.
4. **Loop detection is structural:** each `(cell, dir, channel)` is processed at
   most once, so cycles (possible with splitters/portals in M2) terminate
   after `w·h·8·3` steps at most, and merging beams are not re-traced.

Rendering derives line segments from `out` afterwards, so the solver can skip
that step.

## Interaction

* **Tap** a rotatable piece → rotate clockwise. **Right-click / long-press** →
  counter-clockwise. Mouse wheel also rotates.
* **Drag** from the tray onto an empty floor cell to place; drag a free piece to
  move it, or off the board to return it. Tap a tray slot, then tap a cell, as a
  touch-friendly alternative.
* While dragging, beams preview the drop position live.
* Undo/redo are snapshot-based (boards are tiny). Consecutive rotations of the
  same piece coalesce into one undo step. Reset is itself undoable.
* Win is detected continuously after every committed change — no "fire" button.
