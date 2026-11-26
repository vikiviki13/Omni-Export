import { describe, expect, it } from 'vitest';
import { flattenPlan, mapBlendMode, planPsd } from '../src/ui/exporters/psd-exporter';
import { DEFAULT_SETTINGS } from '../src/ui/utilities/settings';
import { node } from './helpers';

const opts = DEFAULT_SETTINGS.psd;
const red = [{ type: 'SOLID', visible: true, opacity: 1, color: { r: 255, g: 0, b: 0, a: 1 } }];

const tree = node({
  name: 'Home',
  type: 'FRAME',
  width: 400,
  height: 300,
  clipsContent: true,
  fills: red,
  children: [
    node({
      name: 'Group A',
      type: 'GROUP',
      x: 10,
      y: 10,
      width: 100,
      height: 100,
      children: [
        node({ name: 'Label', type: 'TEXT', x: 10, y: 10, characters: 'Hi', fills: red }),
        node({ name: 'Icon', type: 'VECTOR', x: 40, y: 10 }),
      ],
    }),
    node({ name: 'Hidden', type: 'RECTANGLE', visible: false }),
  ],
});

describe('PSD plan', () => {
  it('keeps hierarchy, order and names; root bg becomes Background', () => {
    const plan = planPsd([tree], opts, false);
    expect(plan.items.map((i) => i.name)).toEqual(['Background', 'Group A']);
    const group = plan.items[1];
    expect(group.kind).toBe('folder');
    expect(group.children!.map((c) => c.name)).toEqual(['Label', 'Icon']);
  });
  it('skips hidden layers unless included', () => {
    expect(flattenPlan(planPsd([tree], opts, true).items).some((i) => i.name === 'Hidden')).toBe(
      true,
    );
    expect(flattenPlan(planPsd([tree], opts, false).items).some((i) => i.name === 'Hidden')).toBe(
      false,
    );
  });
  it('flattens groups when not preserved', () => {
    const plan = planPsd([tree], { ...opts, preserveGroups: false }, false);
    expect(plan.items.some((i) => i.kind === 'folder')).toBe(false);
  });
  it('keeps mixed-style text editable and preserves simple text', () => {
    const t = node({ name: 'T', type: 'TEXT', characters: 'x', fills: red });
    const m = node({ name: 'M', type: 'TEXT', characters: 'x', fills: red, mixedText: true });
    const root = node({ name: 'R', type: 'FRAME', children: [t, m] });
    const plan = planPsd([root], { ...opts, mode: 'editable' }, false);
    const kinds = Object.fromEntries(flattenPlan(plan.items).map((i) => [i.name, i.kind]));
    expect(kinds).toMatchObject({ T: 'text', M: 'text' });
    expect(plan.warnings.join()).not.toContain('Mixed-style text was rasterized');
  });
  it('flattens groups containing masks', () => {
    const root = node({
      name: 'R',
      type: 'FRAME',
      children: [
        node({
          name: 'Masked',
          type: 'GROUP',
          children: [
            node({ name: 'm', type: 'RECTANGLE', isMask: true }),
            node({ name: 'img', type: 'RECTANGLE' }),
          ],
        }),
      ],
    });
    const plan = planPsd([root], opts, false);
    expect(plan.items[0].kind).toBe('raster');
    expect(plan.warnings.join()).toContain('mask');
  });
  it('multi-root union mode creates one folder per frame', () => {
    const plan = planPsd(
      [
        tree,
        node({ name: 'Other', type: 'FRAME', children: [node({ name: 'x', type: 'RECTANGLE' })] }),
      ],
      opts,
      false,
    );
    expect(plan.items.map((i) => [i.kind, i.name])).toEqual([
      ['folder', 'Home'],
      ['folder', 'Other'],
    ]);
  });
  it('maps blend modes and warns on unknown ones', () => {
    const warns: string[] = [];
    expect(mapBlendMode('MULTIPLY', false)).toBe('multiply');
    expect(mapBlendMode('PASS_THROUGH', true)).toBe('pass through');
    expect(mapBlendMode('WEIRD', false, (m) => warns.push(m))).toBe('normal');
    expect(warns).toHaveLength(1);
  });
});
