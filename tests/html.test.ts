import { describe, expect, it } from 'vitest';
import { generateHtml } from '../src/ui/exporters/html-exporter';
import type { SerializedDocument } from '../src/shared/types';
import { node } from './helpers';

const white = [
  { type: 'SOLID', visible: true, opacity: 1, color: { r: 255, g: 255, b: 255, a: 1 } },
];
const black = { r: 0, g: 0, b: 0, a: 1 };

function docOf(root: ReturnType<typeof node>): SerializedDocument {
  return {
    scope: 'selection',
    pageName: 'Page',
    roots: [root],
    images: {},
    flowStartIds: [],
    detail: 'full',
    stats: {
      rootCount: 1,
      nodeCount: 3,
      selectedNames: [root.name],
      totalWidth: 0,
      totalHeight: 0,
      textCount: 1,
      vectorCount: 0,
      imageCount: 0,
      unsupportedEffects: 0,
      hiddenCount: 0,
      leafPixelArea: 0,
      warnings: [],
    },
  };
}

const root = node({
  name: 'Home',
  type: 'FRAME',
  width: 400,
  height: 300,
  fills: white,
  layoutMode: 'VERTICAL',
  itemSpacing: 8,
  children: [
    node({
      name: 'Heading/H1',
      type: 'TEXT',
      characters: 'Hello <world>',
      fontFamily: 'Inter',
      fontSize: 32,
      fontWeight: 700,
      textAutoResize: 'WIDTH_AND_HEIGHT',
      fills: [{ type: 'SOLID', visible: true, opacity: 1, color: black }],
    }),
    node({
      name: 'Button/Primary',
      type: 'INSTANCE',
      y: 60,
      width: 120,
      height: 40,
      fills: [{ type: 'SOLID', visible: true, opacity: 1, color: black }],
      children: [
        node({ name: 'Label', type: 'TEXT', characters: 'Go', fontSize: 14, fills: white }),
      ],
    }),
  ],
});

describe('HTML generation', () => {
  const opts = {
    layout: 'pixel' as const,
    zipProject: false,
    interactions: true,
    assetMode: 'inline' as const,
    altOverrides: {},
  };
  it('creates a standalone document with semantic tags', () => {
    const r = generateHtml(docOf(root), opts, false);
    expect(r.html).toContain('<!doctype html>');
    expect(r.html).toContain('<html lang="en">');
    expect(r.html).toContain('name="viewport"');
    expect(r.html).toContain('<main');
    expect(r.html).toMatch(/<h1[^>]*>Hello &lt;world&gt;<\/h1>/);
    expect(r.html).toMatch(/<button[^>]*type="button"/);
    expect(r.html).toContain('<style>');
    expect(r.html).not.toMatch(/https?:\/\//);
    expect(r.js).toBe('');
  });
  it('uses flexbox in responsive mode', () => {
    const r = generateHtml(docOf(root), { ...opts, layout: 'responsive' }, false);
    expect(r.css).toContain('display:flex');
    expect(r.css).toContain('flex-direction:column');
  });
  it('uses absolute positioning in pixel mode', () => {
    const r = generateHtml(docOf(root), opts, false);
    expect(r.css).toContain('position:absolute');
    expect(r.css).toContain('width:400px');
  });
});
