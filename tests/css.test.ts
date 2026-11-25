import { describe, expect, it } from 'vitest';
import {
  autoLayoutToFlex,
  constraintStyles,
  extractVariables,
  flexChildStyles,
  gradientToCss,
  typographyStyles,
} from '../src/ui/exporters/css-generator';
import { node } from './helpers';

describe('Auto Layout → Flexbox', () => {
  it('maps direction, gap, padding and alignment', () => {
    const s = autoLayoutToFlex(
      node({
        name: 'F',
        type: 'FRAME',
        layoutMode: 'HORIZONTAL',
        itemSpacing: 12,
        paddingTop: 8,
        paddingBottom: 8,
        paddingLeft: 16,
        paddingRight: 16,
        primaryAxisAlignItems: 'SPACE_BETWEEN',
        counterAxisAlignItems: 'CENTER',
      }),
    );
    expect(s).toMatchObject({
      display: 'flex',
      'flex-direction': 'row',
      gap: '12px',
      padding: '8px 16px',
      'justify-content': 'space-between',
      'align-items': 'center',
    });
  });
  it('returns nothing without Auto Layout', () => {
    expect(autoLayoutToFlex(node({ name: 'F', type: 'FRAME', layoutMode: 'NONE' }))).toEqual({});
  });
  it('maps FILL / FIXED children', () => {
    const parent = node({ name: 'P', type: 'FRAME', layoutMode: 'HORIZONTAL' });
    const s = flexChildStyles(
      node({
        name: 'C',
        type: 'FRAME',
        width: 200,
        layoutSizingHorizontal: 'FILL',
        layoutSizingVertical: 'FIXED',
        height: 40,
      }),
      parent,
    );
    expect(s.flex).toBe('1 1 0');
    expect(s.height).toBe('40px');
    expect(s.width).toBeUndefined();
  });
});

describe('CSS properties', () => {
  it('constraints produce right / scale placement', () => {
    const n = node({
      name: 'x',
      type: 'RECTANGLE',
      width: 50,
      height: 20,
      constraints: { horizontal: 'MAX', vertical: 'SCALE' },
    });
    const s = constraintStyles(n, { width: 200, height: 100 }, 100, 10);
    expect(s.right).toBe('50px');
    expect(s.top).toBe('10%');
  });
  it('typography', () => {
    const s = typographyStyles({
      fontFamily: 'Inter',
      fontSize: 16,
      fontWeight: 600,
      italic: false,
      lineHeight: 24,
      letterSpacing: '0.05em',
    });
    expect(s['font-family']).toContain("'Inter'");
    expect(s).toMatchObject({
      'font-size': '16px',
      'font-weight': '600',
      'line-height': '24px',
      'letter-spacing': '0.05em',
    });
  });
  it('linear gradient angle', () => {
    const css = gradientToCss(
      {
        type: 'GRADIENT_LINEAR',
        visible: true,
        opacity: 1,
        gradientTransform: [
          [1, 0, 0],
          [0, 1, 0],
        ],
        gradientStops: [
          { position: 0, color: { r: 0, g: 0, b: 0, a: 1 } },
          { position: 1, color: { r: 255, g: 255, b: 255, a: 1 } },
        ],
      },
      100,
      100,
    );
    expect(css).toBe('linear-gradient(90deg, #000000 0%, #ffffff 100%)');
  });
  it('extracts repeated values into custom properties', () => {
    const { vars, rules } = extractVariables([
      { selector: '.a', decls: { color: '#111111', 'font-size': '16px' } },
      { selector: '.b', decls: { color: '#111111', 'font-size': '16px' } },
      { selector: '.c', decls: { color: '#222222' } },
    ]);
    expect(Object.values(vars)).toContain('#111111');
    expect(rules[0].decls.color).toMatch(/^var\(--color-/);
    expect(rules[2].decls.color).toBe('#222222');
  });
});
