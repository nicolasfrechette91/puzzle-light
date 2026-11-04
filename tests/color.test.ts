import { describe, expect, it } from 'vitest';
import { BLUE, colorSymbols, CYAN, GREEN, MAGENTA, NONE, RED, WHITE, YELLOW } from '../src/core/color';

describe('colour symbols', () => {
  it('give each channel its own shape and list a mix by its parts', () => {
    expect([RED, GREEN, BLUE].map(colorSymbols)).toEqual(['▲', '■', '●']);
    expect(colorSymbols(YELLOW)).toBe('▲■');
    expect(colorSymbols(MAGENTA)).toBe('▲●');
    expect(colorSymbols(CYAN)).toBe('■●');
    expect(colorSymbols(WHITE)).toBe('▲■●');
    expect(colorSymbols(NONE)).toBe('');
  });

  it('are distinct for every colour', () => {
    const all = [RED, GREEN, YELLOW, BLUE, MAGENTA, CYAN, WHITE].map(colorSymbols);
    expect(new Set(all).size).toBe(7);
  });
});
