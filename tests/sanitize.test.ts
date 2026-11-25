import { describe, expect, it } from 'vitest';
import { applyFileNamePattern, sanitizeFileName, sanitizeId } from '../src/ui/utilities/sanitize';

describe('sanitizeFileName', () => {
  it('replaces invalid characters with hyphens', () => {
    expect(sanitizeFileName('Home / Desktop: Final')).toBe('Home-Desktop-Final');
  });
  it('removes < > : " / \\ | ? *', () => {
    expect(sanitizeFileName('a<b>c:d"e/f\\g|h?i*j')).toBe('a-b-c-d-e-f-g-h-i-j');
  });
  it('trims repeated spaces and hyphens', () => {
    expect(sanitizeFileName('  a   --  b  ')).toBe('a-b');
  });
  it('never returns an empty name', () => {
    expect(sanitizeFileName('///')).toBe('export');
    expect(sanitizeFileName('')).toBe('export');
  });
  it('avoids reserved Windows names', () => {
    expect(sanitizeFileName('CON')).toBe('CON-file');
  });
});

describe('sanitizeId', () => {
  it('creates valid ids', () => {
    expect(sanitizeId('Hero Section')).toBe('hero-section');
    expect(sanitizeId('123 go')).toBe('n-123-go');
    expect(sanitizeId('???')).toBe('layer');
  });
});

describe('file name pattern', () => {
  it('builds Home-Desktop-1440', () => {
    expect(
      applyFileNamePattern('{name}-{width}', { name: 'Home / Desktop', width: 1440, height: 900 }),
    ).toBe('Home-Desktop-1440');
  });
});
