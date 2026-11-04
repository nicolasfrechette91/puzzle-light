/**
 * Colours are 3-bit additive RGB masks. Mixing is bitwise OR, filtering is AND.
 */
export type Color = number;

export const NONE = 0;
export const RED = 1;
export const GREEN = 2;
export const YELLOW = 3;
export const BLUE = 4;
export const MAGENTA = 5;
export const CYAN = 6;
export const WHITE = 7;

/** Token letter for each mask; the index is the mask. */
const LETTERS = '.rgybmcw';

export const COLOR_NAMES: readonly string[] = [
  'none', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white',
];

export function parseColor(ch: string): Color | undefined {
  const i = LETTERS.indexOf(ch);
  return i > 0 ? i : undefined;
}

export const colorLetter = (c: Color): string => LETTERS[c & 7]!;

/** Display colour for each mask (index = mask), tuned for a dark background. */
export const COLOR_RGB: readonly (readonly [number, number, number])[] = [
  [0, 0, 0],
  [255, 70, 90], // red
  [70, 240, 130], // green
  [255, 222, 90], // yellow
  [80, 140, 255], // blue
  [225, 100, 255], // magenta
  [80, 230, 240], // cyan
  [255, 248, 236], // white
];

export function rgba(c: Color, alpha = 1): string {
  const [r, g, b] = COLOR_RGB[c & 7]!;
  return `rgba(${r},${g},${b},${alpha})`;
}

/**
 * Colour symbols (D-066): one shape per light channel, so a mixed colour
 * lists its parts — yellow is ▲■, white ▲■●.
 */
export const CHANNEL_SYMBOLS: readonly (readonly [Color, string])[] = [
  [RED, '▲'],
  [GREEN, '■'],
  [BLUE, '●'],
];

export const colorSymbols = (c: Color): string =>
  CHANNEL_SYMBOLS.filter(([ch]) => c & ch)
    .map(([, sym]) => sym)
    .join('');
