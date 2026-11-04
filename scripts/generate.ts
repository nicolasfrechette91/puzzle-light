/**
 * Generate levels from seeds.
 *
 *   npm run generate -- --tier medium --seed 42
 *   npm run generate -- --tier hard --seed 1 --count 5
 *   npm run generate -- --tier easy --seed 7 --json     (level JSON, e.g. for the editor's Import)
 */
import { formatGrid, parseLevel } from '../src/core/level';
import { generate, TIERS, type Tier } from '../src/core/generate';

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

const tier = (arg('tier', 'medium') as Tier);
if (!TIERS.includes(tier)) throw new Error(`--tier must be one of ${TIERS.join(', ')}`);
const seed = Number(arg('seed', '1'));
const count = Number(arg('count', '1'));
const json = process.argv.includes('--json');
const out = [];
for (let k = 0; k < count; k++) {
  const t0 = performance.now();
  const g = generate({ seed: seed + k, tier });
  const ms = Math.round(performance.now() - t0);
  if (!g) {
    console.error(`seed ${seed + k}: no level after the attempt limit`);
    continue;
  }
  if (json) {
    out.push(g.level);
    continue;
  }
  console.log(`\n${g.level.name}  (${tier}, seed ${g.seed}, attempt ${g.attempt}, ${ms} ms, difficulty ${g.difficulty.toFixed(1)})`);
  for (const row of formatGrid(parseLevel(g.level))) console.log('  ' + row);
  if (g.level.inv) console.log('  tray:', JSON.stringify(g.level.inv));
  console.log('  solution:', g.solution.moves.join(' '));
}
if (json) console.log(JSON.stringify(count === 1 ? out[0] : out, null, 2));
