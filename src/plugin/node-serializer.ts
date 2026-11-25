import { CONTAINER_TYPES, UNSUPPORTED_NODE_TYPES, VECTOR_TYPES } from '../shared/constants';
import { figmaToRgba, round } from '../shared/color';
import { parseFontStyle } from '../shared/font-utils';
import type {
  ImageAsset,
  Rect,
  SelectionOptions,
  SelectionStats,
  SerializedEffect,
  SerializedNode,
  SerializedPaint,
  SerializedReaction,
  TextSegment,
} from '../shared/types';
import { readImage } from './image-reader';

export interface SerializeContext {
  options: SelectionOptions;
  stats: SelectionStats;
  images: Record<string, ImageAsset>;
  counter: number;
  pageName?: string;
}

export function createStats(): SelectionStats {
  return {
    rootCount: 0,
    nodeCount: 0,
    selectedNames: [],
    totalWidth: 0,
    totalHeight: 0,
    textCount: 0,
    vectorCount: 0,
    imageCount: 0,
    unsupportedEffects: 0,
    hiddenCount: 0,
    leafPixelArea: 0,
    warnings: [],
  };
}

const yieldNow = () => new Promise<void>((r) => setTimeout(r, 0));
const isMixed = (v: unknown) => v === figma.mixed;
const SUPPORTED_EFFECTS = ['DROP_SHADOW', 'INNER_SHADOW', 'LAYER_BLUR', 'BACKGROUND_BLUR'];

function rectOf(b: Rect | null | undefined, fallback: Rect): Rect {
  return b ? { x: b.x, y: b.y, width: b.width, height: b.height } : fallback;
}

export function serializePaint(p: any): SerializedPaint {
  const base: SerializedPaint = {
    type: p.type,
    visible: p.visible !== false,
    opacity: p.opacity ?? 1,
    blendMode: p.blendMode,
  };
  if (p.type === 'SOLID') base.color = figmaToRgba(p.color, 1);
  else if (typeof p.type === 'string' && p.type.startsWith('GRADIENT')) {
    base.gradientStops = (p.gradientStops ?? []).map((s: any) => ({
      position: round(s.position, 4),
      color: figmaToRgba(s.color, s.color.a ?? 1),
    }));
    base.gradientTransform = (
      p.gradientTransform ?? [
        [1, 0, 0],
        [0, 1, 0],
      ]
    ).map((r: readonly number[]) => Array.from(r));
  } else if (p.type === 'IMAGE') {
    base.imageHash = p.imageHash ?? undefined;
    base.scaleMode = p.scaleMode;
  }
  return base;
}

function serializePaints(paints: any): SerializedPaint[] | undefined {
  if (!paints || isMixed(paints)) return undefined;
  return (paints as readonly any[]).map(serializePaint);
}

export function serializeEffect(e: any): SerializedEffect {
  const out: SerializedEffect = { type: e.type, visible: e.visible !== false };
  if (typeof e.radius === 'number') out.radius = e.radius;
  if (typeof e.spread === 'number') out.spread = e.spread;
  if (e.offset) {
    out.offsetX = e.offset.x;
    out.offsetY = e.offset.y;
  }
  if (e.color) out.color = figmaToRgba(e.color, e.color.a ?? 1);
  if (e.blendMode) out.blendMode = e.blendMode;
  return out;
}

function lineHeightOf(l: any): number | string | undefined {
  if (!l || isMixed(l)) return undefined;
  if (l.unit === 'AUTO') return 'normal';
  if (l.unit === 'PIXELS') return round(l.value);
  return `${round(l.value)}%`;
}

function letterSpacingOf(l: any): number | string | undefined {
  if (!l || isMixed(l)) return undefined;
  if (l.unit === 'PIXELS') return round(l.value);
  return `${round(l.value / 100, 4)}em`;
}

function solidColor(paints: any): SerializedPaint | undefined {
  if (!paints || isMixed(paints)) return undefined;
  return (paints as readonly any[])
    .filter((p) => p.visible !== false && p.type === 'SOLID')
    .map(serializePaint)[0];
}

function serializeReactions(node: any): SerializedReaction[] | undefined {
  if (!('reactions' in node) || !Array.isArray(node.reactions) || node.reactions.length === 0)
    return undefined;
  const out: SerializedReaction[] = [];
  for (const r of node.reactions) {
    const actions: any[] = r.actions ?? (r.action ? [r.action] : []);
    out.push({
      trigger: r.trigger?.type ?? 'ON_CLICK',
      actions: actions.filter(Boolean).map((a) => ({
        type: a.type,
        navigation: a.navigation,
        destinationId: a.destinationId ?? undefined,
        url: a.url,
      })),
    });
  }
  return out;
}

function descendantsAreVectorOnly(node: any): { ok: boolean; vectors: number } {
  let vectors = 0;
  const walk = (n: any): boolean => {
    if ('children' in n) {
      for (const c of n.children) if (c.visible !== false && !walk(c)) return false;
      return true;
    }
    if (VECTOR_TYPES.includes(n.type)) {
      vectors++;
      return true;
    }
    if (n.type === 'RECTANGLE' || n.type === 'ELLIPSE') {
      const fills = n.fills;
      if (
        !isMixed(fills) &&
        (fills as any[]).some((f) => f.type === 'IMAGE' && f.visible !== false)
      )
        return false;
      return true;
    }
    return false;
  };
  const ok = walk(node);
  return { ok, vectors };
}

function isIconCandidate(node: any): boolean {
  if (!('children' in node) || node.children.length === 0) return false;
  if (node.width > 128 || node.height > 128) return false;
  const r = descendantsAreVectorOnly(node);
  return r.ok && r.vectors > 0;
}

function hasMaskChild(node: any): boolean {
  return 'children' in node && node.children.some((c: any) => c.isMask && c.visible !== false);
}

async function readComponentName(node: SceneNode): Promise<string | undefined> {
  try {
    if (node.type === 'INSTANCE') {
      const main = await node.getMainComponentAsync();
      if (!main) return undefined;
      const parent = main.parent;
      return parent && parent.type === 'COMPONENT_SET' ? `${parent.name}/${main.name}` : main.name;
    }
    if (node.type === 'COMPONENT') {
      const parent = node.parent;
      return parent && parent.type === 'COMPONENT_SET' ? `${parent.name}/${node.name}` : node.name;
    }
  } catch {
    /* ignore */
  }
  return undefined;
}

function serializeText(node: TextNode, out: SerializedNode): void {
  out.characters = node.characters;
  out.textAlignHorizontal = node.textAlignHorizontal;
  out.textAlignVertical = node.textAlignVertical;
  out.textAutoResize = node.textAutoResize;
  out.hasMissingFont = node.hasMissingFont;
  const segs = node.getStyledTextSegments([
    'fontName',
    'fontSize',
    'fontWeight',
    'fills',
    'textDecoration',
    'letterSpacing',
    'lineHeight',
    'textCase',
  ]) as any[];
  const segments: TextSegment[] = segs.map((s) => {
    const parsed = parseFontStyle(s.fontName.style);
    const fill = solidColor(s.fills);
    return {
      characters: s.characters,
      fontFamily: s.fontName.family,
      fontStyle: s.fontName.style,
      fontWeight: s.fontWeight ?? parsed.weight,
      italic: parsed.italic,
      fontSize: s.fontSize,
      color: fill?.color ? { ...fill.color, a: round(fill.color.a * fill.opacity, 4) } : undefined,
      textDecoration: s.textDecoration,
      textCase: s.textCase,
      letterSpacing: letterSpacingOf(s.letterSpacing),
      lineHeight: lineHeightOf(s.lineHeight),
    };
  });
  const first = segments[0];
  if (first) {
    out.fontFamily = first.fontFamily;
    out.fontStyle = first.fontStyle;
    out.fontSize = first.fontSize;
    out.fontWeight = first.fontWeight;
    out.italic = first.italic;
    out.textDecoration = first.textDecoration;
    out.textCase = first.textCase;
    out.letterSpacing = first.letterSpacing;
    out.lineHeight = first.lineHeight;
  }
  out.mixedText = segments.length > 1;
  if (segments.length > 1) out.textSegments = segments;
}

function serializeLayout(node: any, out: SerializedNode): void {
  if ('layoutMode' in node) {
    out.layoutMode = node.layoutMode;
    if (node.layoutMode !== 'NONE') {
      out.layoutWrap = node.layoutWrap;
      out.primaryAxisAlignItems = node.primaryAxisAlignItems;
      out.counterAxisAlignItems = node.counterAxisAlignItems;
      out.itemSpacing = node.itemSpacing;
      if (typeof node.counterAxisSpacing === 'number')
        out.counterAxisSpacing = node.counterAxisSpacing;
      out.paddingTop = node.paddingTop;
      out.paddingRight = node.paddingRight;
      out.paddingBottom = node.paddingBottom;
      out.paddingLeft = node.paddingLeft;
    }
  }
  if ('layoutAlign' in node) out.layoutAlign = node.layoutAlign;
  if ('layoutGrow' in node) out.layoutGrow = node.layoutGrow;
  if ('layoutPositioning' in node) out.layoutPositioning = node.layoutPositioning;
  if ('layoutSizingHorizontal' in node) out.layoutSizingHorizontal = node.layoutSizingHorizontal;
  if ('layoutSizingVertical' in node) out.layoutSizingVertical = node.layoutSizingVertical;
  for (const k of ['minWidth', 'maxWidth', 'minHeight', 'maxHeight'] as const) {
    if (k in node && typeof node[k] === 'number') (out as any)[k] = node[k];
  }
  if ('constraints' in node && node.constraints) {
    out.constraints = {
      horizontal: node.constraints.horizontal,
      vertical: node.constraints.vertical,
    };
  }
}

function serializeStroke(node: any, out: SerializedNode): void {
  if (!('strokes' in node)) return;
  out.strokes = serializePaints(node.strokes);
  if (typeof node.strokeWeight === 'number') out.strokeWeight = node.strokeWeight;
  if ('strokeAlign' in node) out.strokeAlign = node.strokeAlign;
  if ('strokeTopWeight' in node && typeof node.strokeTopWeight === 'number') {
    const w: [number, number, number, number] = [
      node.strokeTopWeight,
      node.strokeRightWeight,
      node.strokeBottomWeight,
      node.strokeLeftWeight,
    ];
    if (new Set(w).size > 1) out.strokeWeights = w;
  }
  if ('dashPattern' in node && node.dashPattern?.length)
    out.strokeDashes = Array.from(node.dashPattern);
}

function serializeCorners(node: any, out: SerializedNode): void {
  if (!('cornerRadius' in node)) return;
  if (typeof node.cornerRadius === 'number') {
    if (node.cornerRadius > 0) out.cornerRadius = node.cornerRadius;
  } else if ('topLeftRadius' in node) {
    out.cornerRadius = [
      node.topLeftRadius,
      node.topRightRadius,
      node.bottomRightRadius,
      node.bottomLeftRadius,
    ];
  }
}

export async function serializeNode(
  node: SceneNode,
  ctx: SerializeContext,
  parentIsRoot = false,
): Promise<SerializedNode | null> {
  const opts = ctx.options;
  if (UNSUPPORTED_NODE_TYPES.includes(node.type)) {
    ctx.stats.warnings.push(`Unsupported node type ${node.type} ("${node.name}") was skipped`);
    return null;
  }
  if (!node.visible && !opts.includeHidden) return null;

  ctx.counter++;
  if (ctx.counter % 150 === 0) await yieldNow();

  const n: any = node;
  const t = n.absoluteTransform as Transform | undefined;
  const bounds = rectOf(n.absoluteBoundingBox, {
    x: n.x ?? 0,
    y: n.y ?? 0,
    width: n.width ?? 0,
    height: n.height ?? 0,
  });
  const renderBounds = rectOf(n.absoluteRenderBounds, bounds);

  const out: SerializedNode = {
    id: node.id,
    name: node.name,
    type: node.type,
    visible: node.visible,
    locked: n.locked,
    opacity: typeof n.opacity === 'number' ? n.opacity : 1,
    blendMode: n.blendMode,
    x: n.x ?? 0,
    y: n.y ?? 0,
    width: n.width ?? bounds.width,
    height: n.height ?? bounds.height,
    rotation: typeof n.rotation === 'number' ? round(n.rotation, 3) : 0,
    absoluteX: t ? t[0][2] : bounds.x,
    absoluteY: t ? t[1][2] : bounds.y,
    bounds,
    renderBounds,
  };
  if (parentIsRoot && ctx.pageName) out.pageName = ctx.pageName;
  if (n.isMask) {
    out.isMask = true;
    out.maskType = n.maskType;
  }
  if ('fills' in n) out.fills = serializePaints(n.fills);
  serializeStroke(n, out);
  serializeCorners(n, out);
  if ('effects' in n) out.effects = (n.effects as readonly any[]).map(serializeEffect);
  if ('clipsContent' in n) out.clipsContent = n.clipsContent;
  serializeLayout(n, out);

  // ---- stats ----
  const s = ctx.stats;
  s.nodeCount++;
  if (!node.visible) s.hiddenCount++;
  if (node.type === 'TEXT') {
    s.textCount++;
    serializeText(node, out);
    if (node.hasMissingFont) s.warnings.push(`Missing font in "${node.name}"`);
  }
  if (VECTOR_TYPES.includes(node.type)) s.vectorCount++;
  const visibleFills = (out.fills ?? []).filter((f) => f.visible);
  const imageFills = visibleFills.filter((f) => f.type === 'IMAGE' && f.imageHash);
  if (imageFills.length) s.imageCount++;
  for (const e of out.effects ?? [])
    if (e.visible && !SUPPORTED_EFFECTS.includes(e.type)) s.unsupportedEffects++;

  // ---- full detail extras ----
  if (opts.detail === 'full') {
    out.componentName = await readComponentName(node);
    out.reactions = serializeReactions(n);
    if (opts.includeImages) {
      for (const f of imageFills) {
        const hash = f.imageHash as string;
        if (!ctx.images[hash]) {
          const img = await readImage(hash);
          if (img) ctx.images[hash] = img;
        }
      }
    }
    if (opts.includeCss && typeof n.getCSSAsync === 'function') {
      try {
        out.css = (await n.getCSSAsync()) as Record<string, string>;
      } catch {
        /* optional input only */
      }
    }
  }

  // ---- children / svg flattening ----
  const asSvg =
    opts.includeSvg &&
    (VECTOR_TYPES.includes(node.type) ||
      (CONTAINER_TYPES.includes(node.type) && (isIconCandidate(n) || hasMaskChild(n))));
  if (asSvg) {
    try {
      out.svg = (await (node as any).exportAsync({
        format: 'SVG_STRING',
        svgIdAttribute: false,
        svgOutlineText: true,
      })) as string;
      if (hasMaskChild(n) && !isIconCandidate(n))
        s.warnings.push(`Masked group "${node.name}" exported as inline SVG`);
    } catch {
      s.warnings.push(`SVG export failed for "${node.name}"`);
    }
  }
  if (!out.svg && 'children' in n) {
    const kids: SerializedNode[] = [];
    for (const c of n.children as readonly SceneNode[]) {
      const sc = await serializeNode(c, ctx);
      if (sc) kids.push(sc);
    }
    out.children = kids;
  }
  if (!out.children?.length && !out.svg)
    s.leafPixelArea += renderBounds.width * renderBounds.height;
  else if (out.svg) s.leafPixelArea += renderBounds.width * renderBounds.height;
  return out;
}
