/**
 * Validate every bundled level with the solver.
 *
 *   npm run levels                     all levels, 10 s limit per level
 *   npm run levels -- --time 2000      custom per-level limit (ms)
 *   npm run levels -- --only o-03      a single level
 *   npm run levels -- --strict         also fail on warnings
 *
 * Fails (exit 1) when a level does not parse, starts solved, has no solution,
 * cannot be fully searched within its time limit, has a par below the true
 * minimum, or would show a wrong or estimated perfect move count (the game
 * works it out with the hint budget). Warns when a level has several
 * solutions or a generous par.
 */
import { parseLevel, type LevelData } from '../src/core/level';
import { perfectMoves, solveForPlay } from '../src/core/moves';
import { solve, type SolveResult } from '../src/core/solver';
import { trace } from '../src/core/trace';
import { PACKS } from '../src/levels';

interface Args {
  time: number;
  only?: string;
  strict: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { time: 10_000, strict: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--time') args.time = Number(argv[++i]);
    else if (a === '--only') args.only = argv[++i];
    else if (a === '--strict') args.strict = true;
    else throw new Error(`unknown argument ${a}`);
  }
  if (!Number.isFinite(args.time) || args.time <= 0) throw new Error('--time must be a positive number of ms');
  return args;
}

interface Row {
  id: string;
  name: string;
  solutions: string;
  min: string;
  par: string;
  perfect: string;
  difficulty: string;
  states: string;
  ms: string;
  errors: string[];
  warnings: string[];
}

function check(level: LevelData, limitMs: number): Row {
  const row: Row = {
    id: level.id,
    name: level.name,
    solutions: '-',
    min: '-',
    par: level.par === undefined ? '-' : String(level.par),
    perfect: '-',
    difficulty: '-',
    states: '-',
    ms: '-',
    errors: [],
    warnings: [],
  };
  let board;
  try {
    board = parseLevel(level);
  } catch (e) {
    row.errors.push(`does not parse: ${(e as Error).message}`);
    return row;
  }
  if (trace(board).solved) row.errors.push('is already solved at the start');

  const t0 = performance.now();
  const r: SolveResult = solve(board, { deadline: t0 + limitMs, now: () => performance.now(), maxSolutions: Infinity });
  row.ms = String(Math.round(performance.now() - t0));
  row.states = String(r.nodes);
  row.solutions = r.complete ? String(r.count) : `≥${r.count}`;

  if (!r.complete) {
    row.errors.push(r.stopped === 'time' ? `search exceeded ${limitMs} ms` : `search stopped (${r.stopped})`);
    return row;
  }
  if (r.count === 0) {
    row.errors.push('has no solution');
    return row;
  }
  row.min = String(r.minPieces);
  row.difficulty = r.difficulty.toFixed(1);
  // Perfect is the fewest moves over every solution (D-080). The game's own
  // solve (hint budget, D-089) must finish, so it shows the same exact number.
  const perfect = perfectMoves(board, r.solutions);
  const played = solveForPlay(board);
  row.perfect = String(perfect);
  if (!played.exact) row.errors.push(`the game's solve stops early, so it would show perfect as an estimate (~${played.perfect})`);
  else if (played.perfect !== perfect) row.errors.push(`the game would show perfect ${played.perfect}, but ${perfect} moves is possible`);
  // A par level may have longer solutions; it is the par-length one that should be unique.
  const relevant = level.par === undefined ? r.solutions : r.solutions.filter((s) => s.pieces === r.minPieces);
  if (relevant.length > 1) {
    const alt = relevant
      .slice(0, 3)
      .map((s) => s.moves.join(' '))
      .join(' | ');
    row.warnings.push(`${relevant.length} ${level.par === undefined ? '' : 'fewest-piece '}solutions: ${alt}`);
  }
  if (level.par !== undefined && r.count === 1) row.warnings.push('par set but every solution uses the same pieces');
  if (level.par !== undefined) {
    if (level.par < r.minPieces) row.errors.push(`par ${level.par} is impossible: needs at least ${r.minPieces}`);
    else if (level.par > r.minPieces) row.warnings.push(`par ${level.par} is generous: ${r.minPieces} is enough`);
  }
  return row;
}

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + ' '.repeat(n - s.length);
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  let errors = 0;
  let warnings = 0;
  let checked = 0;
  const cols: [keyof Row, string, number][] = [
    ['id', 'id', 7],
    ['name', 'name', 16],
    ['solutions', 'sols', 5],
    ['min', 'min', 4],
    ['par', 'par', 4],
    ['perfect', 'perf', 5],
    ['difficulty', 'diff', 6],
    ['states', 'states', 9],
    ['ms', 'ms', 6],
  ];
  for (const pack of PACKS) {
    const levels = pack.levels.filter((l) => !args.only || l.id === args.only);
    if (!levels.length) continue;
    console.log(`\n${pack.name}`);
    console.log('  ' + cols.map(([, h, w]) => pad(h, w)).join(' '));
    const diffs: number[] = [];
    for (const level of levels) {
      const row = check(level, args.time);
      checked++;
      const mark = row.errors.length ? '✗' : row.warnings.length ? '!' : '✓';
      console.log(`${mark} ` + cols.map(([k, , w]) => pad(String(row[k]), w)).join(' '));
      for (const e of row.errors) console.log(`    error: ${e}`);
      for (const w of row.warnings) console.log(`    warning: ${w}`);
      errors += row.errors.length;
      warnings += row.warnings.length;
      diffs.push(Number(row.difficulty));
    }
    // Within a pack, difficulty should mostly rise; point out big drops for the designer.
    for (let i = 1; i < diffs.length; i++) {
      if (diffs[i]! < diffs[i - 1]! - 3) console.log(`    note: ${levels[i]!.id} scores well below ${levels[i - 1]!.id}; consider reordering`);
    }
  }
  if (args.only && checked === 0) {
    console.error(`no level with id ${args.only}`);
    process.exit(1);
  }
  console.log(`\n${checked} levels · ${errors} error${errors === 1 ? '' : 's'} · ${warnings} warning${warnings === 1 ? '' : 's'}`);
  if (errors || (args.strict && warnings)) process.exit(1);
}

main();
