import { describe, expect, it } from 'vitest';
import { sanitizeSvgIds, optimizeSvg } from '../src/ui/utilities/svg';
import { bytesToBase64, toDataUrl } from '../src/ui/utilities/base64';

describe('SVG ids', () => {
  it('sanitizes, de-duplicates and rewrites references', () => {
    const used = new Set<string>();
    const svg =
      '<svg><g id="Hero Section"/><g id="Hero Section"/><linearGradient id="paint 0"/><rect fill="url(#paint 0)"/></svg>';
    const out = sanitizeSvgIds(svg, used);
    const ids = Array.from(out.matchAll(/ id="([^"]+)"/g)).map((m) => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((i) => /^[a-z_][a-z0-9_-]*$/.test(i))).toBe(true);
    expect(out).toContain('url(#paint-0)');
  });
  it('keeps ids unique across several files', () => {
    const used = new Set<string>();
    const a = sanitizeSvgIds('<svg><g id="x"/></svg>', used);
    const b = sanitizeSvgIds('<svg><g id="x"/></svg>', used);
    expect(a).not.toBe(b);
  });
  it('optimizes', () => {
    expect(optimizeSvg('<?xml version="1.0"?><svg>\n  <!-- c -->\n  <g/>\n</svg>')).toBe(
      '<svg><g/></svg>',
    );
  });
});

describe('base64', () => {
  it('encodes bytes', () => {
    expect(bytesToBase64(new Uint8Array([72, 105]))).toBe('SGk=');
    expect(toDataUrl(new Uint8Array([72, 105]), 'text/plain')).toBe('data:text/plain;base64,SGk=');
  });
  it('handles large buffers', () => {
    expect(bytesToBase64(new Uint8Array(200000)).length).toBeGreaterThan(0);
  });
});
