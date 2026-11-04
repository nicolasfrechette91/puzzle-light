import type { Tier } from './generate';

/**
 * Calm "Adjective Noun" names for generated levels (D-074). 64 × 64 words
 * give 4,096 names; `levelName` shuffles them with a bijection, so the first
 * 4,096 levels of a sequence never share a name.
 */
const ADJECTIVES = [
  'Quiet', 'Pale', 'Silver', 'Distant', 'Gentle', 'Hidden', 'Folded', 'Tilted',
  'Bright', 'Hollow', 'Still', 'Amber', 'Velvet', 'Glass', 'Paper', 'Lunar',
  'Slow', 'Narrow', 'Open', 'Late', 'Early', 'Soft', 'Faint', 'Golden',
  'Misty', 'Clear', 'Mellow', 'Silent', 'Drifting', 'Wandering', 'Sleeping', 'Northern',
  'Southern', 'Eastern', 'Western', 'Winter', 'Summer', 'Autumn', 'Spring', 'Copper',
  'Ivory', 'Coral', 'Indigo', 'Crimson', 'Emerald', 'Opal', 'Pearl', 'Cobalt',
  'Saffron', 'Woven', 'Scattered', 'Patient', 'Little', 'Ancient', 'Secret', 'Lucid',
  'Hushed', 'Tender', 'Twilight', 'Morning', 'Evening', 'Starlit', 'Moonlit', 'Dappled',
] as const;

const NOUNS = [
  'Corridor', 'Lantern', 'Harbour', 'Garden', 'Signal', 'Window', 'Crossing', 'Orchard',
  'Tide', 'Ember', 'Atrium', 'Meridian', 'Prism', 'Shore', 'Veil', 'Arc',
  'Courtyard', 'Echo', 'Horizon', 'Lattice', 'Beacon', 'Bridge', 'Canal', 'Cloister',
  'Comet', 'Cove', 'Dune', 'Field', 'Fjord', 'Forest', 'Fountain', 'Gallery',
  'Glade', 'Grove', 'Hearth', 'Hill', 'Island', 'Lagoon', 'Lake', 'Meadow',
  'Mirror', 'Moon', 'Path', 'Pier', 'Pond', 'Quarry', 'Rain', 'Reef',
  'Ridge', 'River', 'Room', 'Sail', 'Spire', 'Star', 'Stair', 'Stream',
  'Tower', 'Valley', 'Vault', 'Wave', 'Well', 'Willow', 'Harvest', 'Aurora',
] as const;

/** Names before they repeat: 64 × 64 (a constant, so bundles that never name a level can drop the lists). */
export const NAME_COUNT = 4096;

/**
 * A bijection on 12-bit numbers (xor, odd multipliers and xor-shifts are each
 * invertible), so distinct slots get distinct names in a scattered order.
 */
function mix12(x: number, key: number): number {
  x = (x ^ key) & 0xfff;
  x = Math.imul(x, 0x9e5) & 0xfff;
  x ^= x >>> 7;
  x = Math.imul(x, 0x5a3) & 0xfff;
  x ^= x >>> 5;
  return x;
}

/**
 * The name in `slot` (0, 1, 2, …) of a sequence. Each sequence passes its own
 * `key`; slots 0–4,095 of one key are all different names.
 */
export function levelName(slot: number, key: number): string {
  const i = mix12(((slot % NAME_COUNT) + NAME_COUNT) % NAME_COUNT, key);
  return `${ADJECTIVES[i >> 6]} ${NOUNS[i & 63]}`;
}

/** One name sequence per tier. The daily (a medium level) shares medium's key and takes the odd slots. */
const KEYS: Readonly<Record<Tier, number>> = { easy: 0x3a1, medium: 0x5c7, hard: 0x96d };

/** Name of endless level `n` (from 1) of a tier. */
export const endlessName = (tier: Tier, n: number): string => levelName(tier === 'medium' ? 2 * (n - 1) : n - 1, KEYS[tier]);

/** Name of daily puzzle #`n` (from 1); never the same as an endless medium name in the first 2,048 of each. */
export const dailyName = (n: number): string => levelName(2 * (n - 1) + 1, KEYS.medium);
