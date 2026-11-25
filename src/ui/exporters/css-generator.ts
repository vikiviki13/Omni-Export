import { fontStack } from '../../shared/font-utils';
import { rgbaToCss, round, type Rgba } from '../../shared/color';
import type {
  SerializedEffect,
  SerializedNode,
  SerializedPaint,
  TextSegment,
} from '../../shared/types';
import { px } from '../utilities/geometry';

export type Styles = Record<string, string>;
export type LayoutMode = 'pixel' | 'responsive';

export interface Rule {
  selector: string;
  decls: Styles;
  media?: string;
}

export interface StyleEnv {
  /** returns a CSS url() target (data URL or relative asset path) for an image hash */
  imageUrl: (hash: string) => string | null;
  warn: (m: string) => void;
}

// ------------------------------------------------------------------ auto layout

const JUSTIFY: Record<string, string> = {
  MIN: 'flex-start',
  CENTER: 'center',
  MAX: 'flex-end',
  SPACE_BETWEEN: 'space-between',
};
const ALIGN: Record<string, string> = {
  MIN: 'flex-start',
  CENTER: 'center',
  MAX: 'flex-end',
  BASELINE: 'baseline',
};

export const isAutoLayout = (n: SerializedNode) =>
  n.layoutMode === 'HORIZONTAL' || n.layoutMode === 'VERTICAL';

/** Figma Auto Layout → CSS Flexbox. */
export function autoLayoutToFlex(n: SerializedNode): Styles {
  if (!isAutoLayout(n)) return {};
  const s: Styles = {
    display: 'flex',
    'flex-direction': n.layoutMode === 'HORIZONTAL' ? 'row' : 'column',
    'justify-content': JUSTIFY[n.primaryAxisAlignItems ?? 'MIN'] ?? 'flex-start',
    'align-items': ALIGN[n.counterAxisAlignItems ?? 'MIN'] ?? 'flex-start',
  };
  if (n.itemSpacing) s.gap = px(n.itemSpacing);
  const [t, r, b, l] = [
    n.paddingTop ?? 0,
    n.paddingRight ?? 0,
    n.paddingBottom ?? 0,
    n.paddingLeft ?? 0,
  ];
  if (t || r || b || l)
    s.padding =
      t === b && l === r
        ? t === l
          ? px(t)
          : `${px(t)} ${px(r)}`
        : `${px(t)} ${px(r)} ${px(b)} ${px(l)}`;
  if (n.layoutWrap === 'WRAP') {
    s['flex-wrap'] = 'wrap';
    if (n.counterAxisSpacing !== undefined) s['row-gap'] = px(n.counterAxisSpacing);
  }
  return s;
}

type Sizing = 'FIXED' | 'HUG' | 'FILL';

function sizingOf(n: SerializedNode, axis: 'h' | 'v', parentRow: boolean): Sizing {
  const v = axis === 'h' ? n.layoutSizingHorizontal : n.layoutSizingVertical;
  if (v === 'FIXED' || v === 'HUG' || v === 'FILL') return v;
  const isMain = (axis === 'h') === parentRow;
  if (isMain && (n.layoutGrow ?? 0) > 0) return 'FILL';
  if (!isMain && n.layoutAlign === 'STRETCH') return 'FILL';
  return 'FIXED';
}

/** Sizing + flex item properties for a child of an Auto Layout parent. */
export function flexChildStyles(n: SerializedNode, parent: SerializedNode): Styles {
  const row = parent.layoutMode === 'HORIZONTAL';
  const h = sizingOf(n, 'h', row);
  const v = sizingOf(n, 'v', row);
  const main = row ? h : v;
  const cross = row ? v : h;
  const s: Styles = { position: 'relative' };
  if (main === 'FILL') {
    s.flex = '1 1 0';
    s[row ? 'min-width' : 'min-height'] = '0';
  } else s.flex = '0 0 auto';
  if (cross === 'FILL') s['align-self'] = 'stretch';
  const textAuto = n.type === 'TEXT' ? n.textAutoResize : undefined;
  if (h === 'FIXED' && textAuto !== 'WIDTH_AND_HEIGHT') {
    s.width = px(n.width);
    if (!row) s['max-width'] = '100%';
  }
  if (v === 'FIXED' && textAuto !== 'WIDTH_AND_HEIGHT' && textAuto !== 'HEIGHT')
    s.height = px(n.height);
  return s;
}

/** Constraint-based placement inside a non-Auto-Layout parent (responsive mode). */
export function constraintStyles(
  n: SerializedNode,
  parent: { width: number; height: number },
  x: number,
  y: number,
): Styles {
  const s: Styles = { position: 'absolute' };
  const tx: string[] = [];
  const hc = n.rotation ? 'MIN' : (n.constraints?.horizontal ?? 'MIN');
  const vc = n.rotation ? 'MIN' : (n.constraints?.vertical ?? 'MIN');
  const textAuto = n.type === 'TEXT' ? n.textAutoResize : undefined;
  const w = px(n.width);
  const h = px(n.height);
  const noW = textAuto === 'WIDTH_AND_HEIGHT';
  const noH = textAuto === 'WIDTH_AND_HEIGHT' || textAuto === 'HEIGHT';
  const pct = (v: number, total: number) => `${round(total ? (v / total) * 100 : 0, 3)}%`;
  switch (hc) {
    case 'MAX':
      s.right = px(parent.width - x - n.width);
      if (!noW) s.width = w;
      break;
    case 'CENTER':
      s.left = `calc(50% + ${px(x + n.width / 2 - parent.width / 2)})`;
      if (!noW) s.width = w;
      tx.push('translateX(-50%)');
      break;
    case 'STRETCH':
      s.left = px(x);
      s.right = px(parent.width - x - n.width);
      break;
    case 'SCALE':
      s.left = pct(x, parent.width);
      s.width = pct(n.width, parent.width);
      break;
    default:
      s.left = px(x);
      if (!noW) s.width = w;
  }
  switch (vc) {
    case 'MAX':
      s.bottom = px(parent.height - y - n.height);
      if (!noH) s.height = h;
      break;
    case 'CENTER':
      s.top = `calc(50% + ${px(y + n.height / 2 - parent.height / 2)})`;
      if (!noH) s.height = h;
      tx.push('translateY(-50%)');
      break;
    case 'STRETCH':
      s.top = px(y);
      s.bottom = px(parent.height - y - n.height);
      break;
    case 'SCALE':
      s.top = pct(y, parent.height);
      s.height = pct(n.height, parent.height);
      break;
    default:
      s.top = px(y);
      if (!noH) s.height = h;
  }
  if (tx.length) s.transform = tx.join(' ');
  return s;
}

/** Exact absolute placement (pixel-perfect mode). */
export function absoluteStyles(n: SerializedNode, x: number, y: number): Styles {
  const s: Styles = { position: 'absolute', left: px(x), top: px(y) };
  const textAuto = n.type === 'TEXT' ? n.textAutoResize : undefined;
  if (textAuto !== 'WIDTH_AND_HEIGHT') s.width = px(n.width);
  if (textAuto !== 'WIDTH_AND_HEIGHT' && textAuto !== 'HEIGHT') s.height = px(n.height);
  return s;
}

export function rotationStyles(n: SerializedNode, existing?: string): Styles {
  if (!n.rotation) return {};
  const r = `rotate(${round(-n.rotation, 3)}deg)`;
  return { transform: existing ? `${existing} ${r}` : r, 'transform-origin': '0 0' };
}

// ------------------------------------------------------------------ paints

type Mat = number[][];

function invert(t: Mat): Mat {
  const [[a, b, tx], [c, d, ty]] = t;
  const det = a * d - b * c || 1e-9;
  return [
    [d / det, -b / det, (b * ty - d * tx) / det],
    [-c / det, a / det, (c * tx - a * ty) / det],
  ];
}
const apply = (m: Mat, x: number, y: number): [number, number] => [
  m[0][0] * x + m[0][1] * y + m[0][2],
  m[1][0] * x + m[1][1] * y + m[1][2],
];

function withAlpha(c: Rgba, k: number): Rgba {
  return { ...c, a: round(c.a * k, 4) };
}

export function gradientToCss(p: SerializedPaint, w: number, h: number): string | null {
  const stops = p.gradientStops ?? [];
  if (!stops.length || !p.gradientTransform) return null;
  const inv = invert(p.gradientTransform);
  const stopList = (pos: (t: number) => number) =>
    stops
      .map((s) => `${rgbaToCss(withAlpha(s.color, p.opacity))} ${round(pos(s.position) * 100, 2)}%`)
      .join(', ');
  if (p.type === 'GRADIENT_LINEAR') {
    const [p0x, p0y] = apply(inv, 0, 0.5);
    const [p1x, p1y] = apply(inv, 1, 0.5);
    const dx = (p1x - p0x) * w;
    const dy = (p1y - p0y) * h;
    const deg = (Math.atan2(dx, -dy) * 180) / Math.PI;
    const angle = (deg + 360) % 360;
    const th = (angle * Math.PI) / 180;
    const len = Math.abs(w * Math.sin(th)) + Math.abs(h * Math.cos(th)) || 1;
    const ux = Math.sin(th);
    const uy = -Math.cos(th);
    const proj = (px_: number, py_: number) =>
      ((px_ * w - w / 2) * ux + (py_ * h - h / 2) * uy) / len + 0.5;
    const s0 = proj(p0x, p0y);
    const s1 = proj(p1x, p1y);
    return `linear-gradient(${round(angle, 2)}deg, ${stopList((t) => s0 + t * (s1 - s0))})`;
  }
  const [cx, cy] = apply(inv, 0.5, 0.5);
  const [ex, ey] = apply(inv, 1, 0.5);
  const [fx, fy] = apply(inv, 0.5, 1);
  if (p.type === 'GRADIENT_ANGULAR') {
    const deg = (Math.atan2((ey - cy) * h, (ex - cx) * w) * 180) / Math.PI + 90;
    return `conic-gradient(from ${round((deg + 360) % 360, 2)}deg at ${round(cx * 100, 2)}% ${round(cy * 100, 2)}%, ${stopList((t) => t)})`;
  }
  const rx = Math.hypot((ex - cx) * w, (ey - cy) * h);
  const ry = Math.hypot((fx - cx) * w, (fy - cy) * h);
  return `radial-gradient(${round(rx, 2)}px ${round(ry, 2)}px at ${round(cx * 100, 2)}% ${round(cy * 100, 2)}%, ${stopList((t) => t)})`;
}

const visible = <T extends { visible: boolean }>(list: T[] | undefined): T[] =>
  (list ?? []).filter((x) => x.visible);

/** Fills → background / background-color (Figma stacks bottom→top, CSS top→bottom). */
export function backgroundStyles(n: SerializedNode, env: StyleEnv, skipImages = false): Styles {
  const fills = visible(n.fills).filter((f) => !(skipImages && f.type === 'IMAGE'));
  if (!fills.length) return {};
  if (fills.length === 1 && fills[0].type === 'SOLID' && fills[0].color) {
    return { 'background-color': rgbaToCss(withAlpha(fills[0].color, fills[0].opacity)) };
  }
  const images: string[] = [];
  const sizes: string[] = [];
  const positions: string[] = [];
  const repeats: string[] = [];
  for (const f of [...fills].reverse()) {
    if (f.type === 'SOLID' && f.color) {
      const c = rgbaToCss(withAlpha(f.color, f.opacity));
      images.push(`linear-gradient(${c}, ${c})`);
      sizes.push('auto');
      positions.push('0 0');
      repeats.push('no-repeat');
    } else if (f.type.startsWith('GRADIENT')) {
      const g = gradientToCss(f, n.width, n.height);
      if (!g) continue;
      if (f.type === 'GRADIENT_DIAMOND')
        env.warn(`Diamond gradient on "${n.name}" was approximated with a radial gradient`);
      images.push(g);
      sizes.push('auto');
      positions.push('0 0');
      repeats.push('no-repeat');
    } else if (f.type === 'IMAGE' && f.imageHash) {
      const url = env.imageUrl(f.imageHash);
      if (!url) continue;
      images.push(`url("${url}")`);
      const mode = f.scaleMode ?? 'FILL';
      sizes.push(mode === 'FIT' ? 'contain' : mode === 'TILE' ? 'auto' : 'cover');
      positions.push('center');
      repeats.push(mode === 'TILE' ? 'repeat' : 'no-repeat');
      if (mode === 'CROP')
        env.warn(`Image crop on "${n.name}" was approximated with object-fit: cover`);
      if (f.opacity < 1) env.warn(`Image opacity on "${n.name}" is not preserved`);
    } else if (f.type === 'VIDEO') env.warn(`Video fill on "${n.name}" is not supported`);
  }
  if (!images.length) return {};
  return {
    'background-image': images.join(', '),
    'background-size': sizes.join(', '),
    'background-position': positions.join(', '),
    'background-repeat': repeats.join(', '),
  };
}

export function radiusCss(n: SerializedNode): string | undefined {
  const r = n.cornerRadius;
  if (r === undefined) return undefined;
  if (typeof r === 'number') return r > 0 ? px(r) : undefined;
  if (r.every((v) => v === 0)) return undefined;
  return r.every((v) => v === r[0]) ? px(r[0]) : r.map(px).join(' ');
}

export interface StrokeResult {
  styles: Styles;
  outsideShadow?: string;
}

export function strokeStyles(n: SerializedNode, env: StyleEnv): StrokeResult {
  const strokes = visible(n.strokes);
  const weight = n.strokeWeight ?? 0;
  if (!strokes.length || (!weight && !n.strokeWeights)) return { styles: {} };
  const top = strokes[strokes.length - 1];
  let color: Rgba | undefined = top.color ? withAlpha(top.color, top.opacity) : undefined;
  if (!color && top.gradientStops?.length) {
    color = top.gradientStops[0].color;
    env.warn(`Gradient stroke on "${n.name}" was approximated with its first colour`);
  }
  if (!color) return { styles: {} };
  const css = rgbaToCss(color);
  const dashed = n.strokeDashes?.length
    ? (n.strokeDashes[0] ?? 0) <= weight
      ? 'dotted'
      : 'dashed'
    : 'solid';
  if (n.strokeAlign === 'OUTSIDE' && !n.strokeWeights && !n.strokeDashes?.length) {
    return { styles: {}, outsideShadow: `0 0 0 ${px(weight)} ${css}` };
  }
  if (n.strokeWeights) {
    const [t, r, b, l] = n.strokeWeights;
    return {
      styles: {
        'border-style': dashed,
        'border-color': css,
        'border-width': `${px(t)} ${px(r)} ${px(b)} ${px(l)}`,
      },
    };
  }
  return { styles: { border: `${px(weight)} ${dashed} ${css}` } };
}

// ------------------------------------------------------------------ effects

const BLEND: Record<string, string> = {
  DARKEN: 'darken',
  MULTIPLY: 'multiply',
  LINEAR_BURN: 'plus-darker',
  COLOR_BURN: 'color-burn',
  LIGHTEN: 'lighten',
  SCREEN: 'screen',
  LINEAR_DODGE: 'plus-lighter',
  COLOR_DODGE: 'color-dodge',
  OVERLAY: 'overlay',
  SOFT_LIGHT: 'soft-light',
  HARD_LIGHT: 'hard-light',
  DIFFERENCE: 'difference',
  EXCLUSION: 'exclusion',
  HUE: 'hue',
  SATURATION: 'saturation',
  COLOR: 'color',
  LUMINOSITY: 'luminosity',
};

export function effectStyles(
  n: SerializedNode,
  isText: boolean,
  env: StyleEnv,
  extraShadow?: string,
): Styles {
  const s: Styles = {};
  const shadows: string[] = [];
  const filters: string[] = [];
  const backdrop: string[] = [];
  const effects: SerializedEffect[] = visible(n.effects);
  for (const e of effects) {
    const c = e.color ? rgbaToCss(e.color) : 'rgba(0, 0, 0, 0.25)';
    if (e.type === 'DROP_SHADOW') {
      shadows.push(
        isText || n.type === 'TEXT'
          ? `${px(e.offsetX ?? 0)} ${px(e.offsetY ?? 0)} ${px(e.radius ?? 0)} ${c}`
          : `${px(e.offsetX ?? 0)} ${px(e.offsetY ?? 0)} ${px(e.radius ?? 0)} ${px(e.spread ?? 0)} ${c}`,
      );
    } else if (e.type === 'INNER_SHADOW') {
      if (n.type !== 'TEXT')
        shadows.push(
          `inset ${px(e.offsetX ?? 0)} ${px(e.offsetY ?? 0)} ${px(e.radius ?? 0)} ${px(e.spread ?? 0)} ${c}`,
        );
      else env.warn(`Inner shadow on text "${n.name}" is not supported in CSS`);
    } else if (e.type === 'LAYER_BLUR') filters.push(`blur(${px((e.radius ?? 0) / 2)})`);
    else if (e.type === 'BACKGROUND_BLUR') backdrop.push(`blur(${px((e.radius ?? 0) / 2)})`);
    else env.warn(`Effect ${e.type} on "${n.name}" is not supported in CSS`);
  }
  shadows.reverse();
  if (extraShadow) shadows.push(extraShadow);
  if (shadows.length) s[n.type === 'TEXT' ? 'text-shadow' : 'box-shadow'] = shadows.join(', ');
  if (filters.length) s.filter = filters.join(' ');
  if (backdrop.length) {
    s['backdrop-filter'] = backdrop.join(' ');
    s['-webkit-backdrop-filter'] = backdrop.join(' ');
  }
  return s;
}

export function visualStyles(n: SerializedNode): Styles {
  const s: Styles = {};
  if (n.opacity < 1) s.opacity = String(round(n.opacity, 3));
  const b = n.blendMode && BLEND[n.blendMode];
  if (b) s['mix-blend-mode'] = b;
  return s;
}

// ------------------------------------------------------------------ text

const ALIGN_H: Record<string, string> = {
  LEFT: 'left',
  CENTER: 'center',
  RIGHT: 'right',
  JUSTIFIED: 'justify',
};
const CASE: Record<string, string> = {
  UPPER: 'uppercase',
  LOWER: 'lowercase',
  TITLE: 'capitalize',
};
const DECO: Record<string, string> = { UNDERLINE: 'underline', STRIKETHROUGH: 'line-through' };

type TextLike = Pick<
  TextSegment,
  | 'fontFamily'
  | 'fontWeight'
  | 'italic'
  | 'fontSize'
  | 'textDecoration'
  | 'textCase'
  | 'letterSpacing'
  | 'lineHeight'
  | 'color'
>;

export function typographyStyles(t: Partial<TextLike>): Styles {
  const s: Styles = {};
  if (t.fontFamily) s['font-family'] = fontStack(t.fontFamily);
  if (t.fontSize !== undefined) s['font-size'] = px(t.fontSize);
  if (t.fontWeight !== undefined) s['font-weight'] = String(t.fontWeight);
  if (t.italic !== undefined) s['font-style'] = t.italic ? 'italic' : 'normal';
  if (t.lineHeight !== undefined)
    s['line-height'] = typeof t.lineHeight === 'number' ? px(t.lineHeight) : t.lineHeight;
  if (t.letterSpacing !== undefined && t.letterSpacing !== 0)
    s['letter-spacing'] =
      typeof t.letterSpacing === 'number' ? px(t.letterSpacing) : t.letterSpacing;
  if (t.textDecoration && DECO[t.textDecoration]) s['text-decoration'] = DECO[t.textDecoration];
  if (t.textCase && CASE[t.textCase]) s['text-transform'] = CASE[t.textCase];
  if (t.color) s.color = rgbaToCss(t.color);
  return s;
}

export function textStyles(n: SerializedNode, env: StyleEnv): Styles {
  const first = n.textSegments?.[0];
  const fill = visible(n.fills)[0];
  const s: Styles = typographyStyles({
    fontFamily: n.fontFamily,
    fontSize: n.fontSize,
    fontWeight: n.fontWeight,
    italic: n.italic,
    lineHeight: n.lineHeight,
    letterSpacing: n.letterSpacing,
    textDecoration: n.textDecoration,
    textCase: n.textCase,
  });
  if (fill?.type === 'SOLID' && fill.color)
    s.color = rgbaToCss(withAlpha(fill.color, fill.opacity));
  else if (fill?.type.startsWith('GRADIENT')) {
    const g = gradientToCss(fill, n.width, n.height);
    if (g) {
      s['background-image'] = g;
      s['-webkit-background-clip'] = 'text';
      s['background-clip'] = 'text';
      s['-webkit-text-fill-color'] = 'transparent';
    }
  } else if (first?.color) s.color = rgbaToCss(first.color);
  else if (fill?.type === 'IMAGE') env.warn(`Image fill on text "${n.name}" is not supported`);
  s['text-align'] = ALIGN_H[n.textAlignHorizontal ?? 'LEFT'] ?? 'left';
  s['white-space'] = n.textAutoResize === 'WIDTH_AND_HEIGHT' ? 'pre' : 'pre-wrap';
  if (n.textAutoResize === 'TRUNCATE') {
    s.overflow = 'hidden';
    s['text-overflow'] = 'ellipsis';
  }
  if (
    n.textAutoResize !== 'WIDTH_AND_HEIGHT' &&
    n.textAutoResize !== 'HEIGHT' &&
    n.textAlignVertical &&
    n.textAlignVertical !== 'TOP'
  ) {
    s.display = 'flex';
    s['flex-direction'] = 'column';
    s['justify-content'] = n.textAlignVertical === 'CENTER' ? 'center' : 'flex-end';
  }
  return s;
}

/** Styles of a mixed-text segment that differ from the node's base text styles. */
export function segmentStyles(seg: TextSegment, base: SerializedNode): Styles {
  const baseColor = visible(base.fills)[0]?.color;
  const all = typographyStyles({
    fontFamily: seg.fontFamily,
    fontSize: seg.fontSize,
    fontWeight: seg.fontWeight,
    italic: seg.italic,
    textDecoration: seg.textDecoration,
    textCase: seg.textCase,
    letterSpacing: seg.letterSpacing,
    lineHeight: seg.lineHeight,
    color: seg.color,
  });
  const ref = typographyStyles({
    fontFamily: base.fontFamily,
    fontSize: base.fontSize,
    fontWeight: base.fontWeight,
    italic: base.italic,
    textDecoration: base.textDecoration,
    textCase: base.textCase,
    letterSpacing: base.letterSpacing,
    lineHeight: base.lineHeight,
    color: baseColor,
  });
  const out: Styles = {};
  for (const k of Object.keys(all)) if (all[k] !== ref[k]) out[k] = all[k];
  if (!seg.textDecoration || seg.textDecoration === 'NONE') delete out['text-decoration'];
  return out;
}

// ------------------------------------------------------------------ stylesheet assembly

export const BASE_CSS = `*,*::before,*::after{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:#fff}
p,h1,h2,h3,h4,h5,h6,ul,ol,figure{margin:0;padding:0}
ul,ol{list-style:none}
img,svg{display:block}
a{color:inherit;text-decoration:none}
button{font:inherit;color:inherit;text-align:inherit;background:none;border:0;padding:0;margin:0;cursor:pointer}
input{font:inherit;color:inherit;margin:0;outline-offset:2px}
:focus-visible{outline:2px solid #0d99ff;outline-offset:2px}
[hidden]{display:none!important}
.frame{position:relative}
.overlay{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.45);z-index:1000;overflow:auto}
.overlay[hidden]{display:none!important}
.overlay>.frame{flex:none;margin:auto}`;

const COLOR_PROPS = new Set(['color', 'background-color', 'border-color', 'outline-color']);

interface VarSpec {
  prefix: string;
  names?: string[];
}

function categoryOf(prop: string, value: string): { cat: string; spec: VarSpec } | null {
  if (COLOR_PROPS.has(prop) && /^(#|rgba?\()/.test(value))
    return { cat: 'color', spec: { prefix: 'color', names: ['primary', 'secondary'] } };
  if (prop === 'font-size') return { cat: 'font-size', spec: { prefix: 'font-size' } };
  if (prop === 'border-radius' && /^[\d.]+px$/.test(value))
    return { cat: 'radius', spec: { prefix: 'radius' } };
  if (prop === 'box-shadow' || prop === 'text-shadow')
    return { cat: 'shadow', spec: { prefix: 'shadow' } };
  if ((prop === 'gap' || prop === 'padding') && /^[\d.]+px$/.test(value))
    return { cat: 'space', spec: { prefix: 'space' } };
  return null;
}

/** Replaces repeated colours, font sizes, radii, shadows and spacing with CSS custom properties. */
export function extractVariables(rules: Rule[]): { vars: Record<string, string>; rules: Rule[] } {
  const counts = new Map<string, { n: number; cat: string; spec: VarSpec; value: string }>();
  for (const r of rules) {
    for (const [prop, value] of Object.entries(r.decls)) {
      const c = categoryOf(prop, value);
      if (!c) continue;
      const key = `${c.cat}|${value}`;
      const e = counts.get(key);
      if (e) e.n++;
      else counts.set(key, { n: 1, cat: c.cat, spec: c.spec, value });
    }
  }
  const vars: Record<string, string> = {};
  const nameOf = new Map<string, string>();
  const perCat = new Map<string, number>();
  const sorted = Array.from(counts.entries())
    .filter(([, v]) => v.n >= 2)
    .sort((a, b) => b[1].n - a[1].n);
  for (const [key, v] of sorted) {
    const idx = perCat.get(v.cat) ?? 0;
    perCat.set(v.cat, idx + 1);
    let suffix: string;
    if (v.cat === 'color') suffix = v.spec.names?.[idx] ?? String(idx + 1);
    else if (v.cat === 'shadow') suffix = String(idx + 1);
    else suffix = v.value.replace(/px$/, '').replace('.', '_');
    let name = `--${v.spec.prefix}-${suffix}`;
    while (vars[name] !== undefined) name += '-b';
    vars[name] = v.value;
    nameOf.set(key, name);
  }
  const out = rules.map((r) => {
    const decls: Styles = {};
    for (const [prop, value] of Object.entries(r.decls)) {
      const c = categoryOf(prop, value);
      const nm = c ? nameOf.get(`${c.cat}|${value}`) : undefined;
      decls[prop] = nm ? `var(${nm})` : value;
    }
    return { ...r, decls };
  });
  return { vars, rules: out };
}

export function declsToCss(decls: Styles): string {
  return Object.entries(decls)
    .map(([k, v]) => `${k}:${v}`)
    .join(';');
}

export function rulesToCss(rules: Rule[], vars: Record<string, string>): string {
  const lines: string[] = [];
  const varLines = Object.entries(vars).map(([k, v]) => `  ${k}: ${v};`);
  if (varLines.length) lines.push(`:root {\n${varLines.join('\n')}\n}`);
  lines.push(BASE_CSS);
  const plain = rules.filter((r) => !r.media && Object.keys(r.decls).length);
  for (const r of plain) lines.push(`${r.selector}{${declsToCss(r.decls)}}`);
  const medias = new Map<string, Rule[]>();
  for (const r of rules.filter((x) => x.media))
    medias.set(r.media as string, [...(medias.get(r.media as string) ?? []), r]);
  for (const [m, rs] of medias)
    lines.push(
      `@media ${m}{\n${rs.map((r) => `  ${r.selector}{${declsToCss(r.decls)}}`).join('\n')}\n}`,
    );
  return lines.join('\n');
}
