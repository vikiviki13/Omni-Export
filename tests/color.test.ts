import { describe, expect, it } from 'vitest';
import { figmaToRgba, hexToRgba, rgbaToCss, rgbaToHex } from '../src/shared/color';

describe('colour conversion', () => {
  it('converts 0-1 floats to 0-255', () => {
    expect(figmaToRgba({ r: 1, g: 0.5, b: 0 })).toEqual({ r: 255, g: 128, b: 0, a: 1 });
  });
  it('multiplies opacity into alpha', () => {
    expect(figmaToRgba({ r: 0, g: 0, b: 0, a: 0.5 }, 0.5).a).toBe(0.25);
  });
  it('formats css', () => {
    expect(rgbaToCss({ r: 255, g: 0, b: 0, a: 1 })).toBe('#ff0000');
    expect(rgbaToCss({ r: 0, g: 0, b: 0, a: 0.5 })).toBe('rgba(0, 0, 0, 0.5)');
    expect(rgbaToHex({ r: 1, g: 2, b: 3, a: 1 })).toBe('#010203');
  });
  it('parses hex', () => {
    expect(hexToRgba('#fff')).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(hexToRgba('nope')).toBeNull();
  });
});
