import { writePsdUint8Array, type BlendMode, type Layer, type Psd } from 'ag-psd';
import {
  CONTAINER_TYPES,
  PSD_HARD_LIMIT_BYTES,
  PSD_MAX_DIMENSION,
  PSD_WARN_BYTES,
} from '../../shared/constants';
import { psFontName } from '../../shared/font-utils';
import type {
  ConversionReport,
  Rect,
  SerializedDocument,
  SerializedNode,
} from '../../shared/types';
import type { ExportContext, ExportOutput, PsdOptions } from '../types/export-types';
import { bytesToCanvas, createCanvas, cropCanvas, releaseCanvas } from '../utilities/canvas';
import { toPsdColor } from '../utilities/color';
import { intersectRect, layerPlacement, unionRects } from '../utilities/geometry';
import { applyFileNamePattern, uniqueName } from '../utilities/sanitize';
import { runQueue, yieldToUi } from '../utilities/queue';
import { logger } from '../utilities/logger';
import { packageFiles, totalBytes } from './zip-exporter';

// ------------------------------------------------------------------ planning (pure)

export type PlanKind = 'folder' | 'raster' | 'text' | 'shape';

export interface PlanItem {
  kind: PlanKind;
  node: SerializedNode;
  name: string;
  /** render only the node's own paint (children hidden) */
  backgroundOnly?: boolean;
  /** absolute-document clip rectangle inherited from clipping ancestors */
  clip: Rect | null;
  children?: PlanItem[];
}

export interface PsdPlan {
  items: PlanItem[];
  processed: number;
  preserved: number;
  rasterized: number;
  textPreserved: number;
  warnings: string[];
}

interface PlanState {
  opts: PsdOptions;
  includeHidden: boolean;
  plan: PsdPlan;
}

const FIGMA_TO_PSD_BLEND: Record<string, BlendMode> = {
  PASS_THROUGH: 'pass through',
  NORMAL: 'normal',
  DARKEN: 'darken',
  MULTIPLY: 'multiply',
  LINEAR_BURN: 'linear burn',
  COLOR_BURN: 'color burn',
  LIGHTEN: 'lighten',
  SCREEN: 'screen',
  LINEAR_DODGE: 'linear dodge',
  COLOR_DODGE: 'color dodge',
  OVERLAY: 'overlay',
  SOFT_LIGHT: 'soft light',
  HARD_LIGHT: 'hard light',
  DIFFERENCE: 'difference',
  EXCLUSION: 'exclusion',
  HUE: 'hue',
  SATURATION: 'saturation',
  COLOR: 'color',
  LUMINOSITY: 'luminosity',
};

export function mapBlendMode(
  mode: string | undefined,
  isFolder: boolean,
  warn?: (m: string) => void,
): BlendMode {
  if (!mode) return isFolder ? 'pass through' : 'normal';
  const m = FIGMA_TO_PSD_BLEND[mode];
  if (!m) {
    warn?.(`Unsupported blend mode ${mode} was converted to normal`);
    return 'normal';
  }
  return !isFolder && m === 'pass through' ? 'normal' : m;
}

function hasOwnPaint(n: SerializedNode): boolean {
  const fills = (n.fills ?? []).some((f) => f.visible);
  const strokes = (n.strokes ?? []).some((f) => f.visible) && (n.strokeWeight ?? 1) > 0;
  const shadows = (n.effects ?? []).some(
    (e) => e.visible && (e.type === 'DROP_SHADOW' || e.type === 'INNER_SHADOW'),
  );
  return fills || strokes || shadows;
}

function textEditableReason(n: SerializedNode): string | null {
  if (n.mixedText) return 'Mixed-style text was rasterized';
  if (n.hasMissingFont) return 'Font was not available in PSD';
  if (n.rotation) return 'Rotated text was rasterized';
  if (n.textCase && n.textCase !== 'ORIGINAL') return 'Text with case transform was rasterized';
  if ((n.effects ?? []).some((e) => e.visible)) return 'Text with effects was rasterized';
  if ((n.strokes ?? []).some((s) => s.visible)) return 'Text with strokes was rasterized';
  const fills = (n.fills ?? []).filter((f) => f.visible);
  if (fills.length !== 1 || fills[0].type !== 'SOLID')
    return 'Text with complex fills was rasterized';
  if (n.opacity !== 1) return 'Semi-transparent text was rasterized';
  return null;
}

function isSimpleRect(n: SerializedNode): boolean {
  if (n.type !== 'RECTANGLE' || n.rotation || n.opacity !== 1 || n.cornerRadius) return false;
  if ((n.effects ?? []).some((e) => e.visible) || (n.strokes ?? []).some((s) => s.visible))
    return false;
  const fills = (n.fills ?? []).filter((f) => f.visible);
  return (
    fills.length === 1 &&
    fills[0].type === 'SOLID' &&
    fills[0].opacity === 1 &&
    (fills[0].color?.a ?? 1) === 1
  );
}

function planNode(
  node: SerializedNode,
  st: PlanState,
  clip: Rect | null,
  out: PlanItem[],
  forceFolder = false,
): void {
  if (!node.visible && !st.includeHidden) return;
  const { plan, opts } = st;
  plan.processed++;
  const rb = node.renderBounds;
  if (rb.width <= 0 && rb.height <= 0) return;

  const kids = node.children ?? [];
  const isContainer = CONTAINER_TYPES.includes(node.type) && kids.length > 0 && !node.svg;
  const hasMask = kids.some((k) => k.isMask && (k.visible || st.includeHidden));
  const blurFx = (node.effects ?? []).some(
    (e) => e.visible && (e.type === 'LAYER_BLUR' || e.type === 'BACKGROUND_BLUR'),
  );
  const flatten = node.type === 'INSTANCE' && opts.flattenInstances && !forceFolder;

  if (isContainer && !hasMask && !blurFx && !flatten) {
    const childClip = node.clipsContent
      ? clip
        ? (intersectRect(clip, node.bounds) ?? node.bounds)
        : node.bounds
      : clip;
    const inner: PlanItem[] = [];
    if (hasOwnPaint(node)) {
      inner.push({
        kind: 'raster',
        node,
        name: `${node.name} background`,
        backgroundOnly: true,
        clip,
      });
      plan.rasterized++;
    }
    for (const k of kids) planNode(k, st, childClip, inner);
    if (opts.preserveGroups) {
      out.push({ kind: 'folder', node, name: node.name, clip, children: inner });
      plan.preserved++;
    } else {
      if (node.opacity < 1)
        plan.warnings.push(`Group opacity of "${node.name}" was ignored (groups not preserved)`);
      out.push(...inner);
    }
    return;
  }

  if (isContainer) {
    if (hasMask) plan.warnings.push(`Complex mask flattened in "${node.name}"`);
    else if (blurFx) plan.warnings.push(`Blur effect rasterized in "${node.name}"`);
  }

  if (opts.mode === 'editable') {
    if (node.type === 'TEXT') {
      const reason = textEditableReason(node);
      if (!reason) {
        out.push({ kind: 'text', node, name: node.name, clip });
        plan.preserved++;
        plan.textPreserved++;
        return;
      }
      plan.warnings.push(`${reason} ("${node.name}")`);
    } else if (isSimpleRect(node)) {
      out.push({ kind: 'shape', node, name: node.name, clip });
      plan.preserved++;
      return;
    }
  }
  out.push({ kind: 'raster', node, name: node.name, clip });
  plan.rasterized++;
}

/**
 * Builds the layer plan for one PSD.
 * `roots.length === 1` → the root is the canvas (its children become top-level layers).
 * Otherwise every root becomes a top-level folder on a shared canvas.
 */
export function planPsd(
  roots: SerializedNode[],
  opts: PsdOptions,
  includeHidden: boolean,
): PsdPlan {
  const plan: PsdPlan = {
    items: [],
    processed: 0,
    preserved: 0,
    rasterized: 0,
    textPreserved: 0,
    warnings: [],
  };
  const st: PlanState = { opts, includeHidden, plan };
  const withBg = opts.background === 'frame';

  const planRootContents = (root: SerializedNode, out: PlanItem[]) => {
    const kids = root.children ?? [];
    const hasMask = kids.some((k) => k.isMask);
    const isContainer = CONTAINER_TYPES.includes(root.type) && kids.length > 0 && !root.svg;
    plan.processed++;
    if (!isContainer || hasMask) {
      if (hasMask) plan.warnings.push(`Complex mask flattened in "${root.name}"`);
      out.push({ kind: 'raster', node: root, name: root.name, clip: null });
      plan.rasterized++;
      return;
    }
    const clip = root.clipsContent ? root.bounds : null;
    if (withBg && hasOwnPaint(root)) {
      out.push({
        kind: 'raster',
        node: root,
        name: 'Background',
        backgroundOnly: true,
        clip: null,
      });
      plan.rasterized++;
    }
    for (const k of kids) planNode(k, st, clip, out);
  };

  if (roots.length === 1) planRootContents(roots[0], plan.items);
  else {
    for (const r of roots) {
      if (!r.visible && !includeHidden) continue;
      const inner: PlanItem[] = [];
      planRootContents(r, inner);
      plan.items.push({ kind: 'folder', node: r, name: r.name, clip: null, children: inner });
      plan.preserved++;
    }
  }
  return plan;
}

export function flattenPlan(items: PlanItem[], acc: PlanItem[] = []): PlanItem[] {
  for (const i of items) {
    if (i.kind === 'folder') flattenPlan(i.children ?? [], acc);
    else acc.push(i);
  }
  return acc;
}

// ------------------------------------------------------------------ rendering

interface Rendered {
  canvas: HTMLCanvasElement;
  left: number;
  top: number;
}

const BLEND_TO_CANVAS: Record<string, GlobalCompositeOperation> = {
  multiply: 'multiply',
  screen: 'screen',
  overlay: 'overlay',
  darken: 'darken',
  lighten: 'lighten',
  'color dodge': 'color-dodge',
  'color burn': 'color-burn',
  'hard light': 'hard-light',
  'soft light': 'soft-light',
  difference: 'difference',
  exclusion: 'exclusion',
  hue: 'hue',
  saturation: 'saturation',
  color: 'color',
  luminosity: 'luminosity',
  'linear dodge': 'lighter',
};

function drawLayers(ctx: CanvasRenderingContext2D, layers: Layer[], w: number, h: number): void {
  for (const l of layers) {
    if (l.hidden) continue;
    const opacity = l.opacity ?? 1;
    const op = BLEND_TO_CANVAS[l.blendMode ?? 'normal'] ?? 'source-over';
    if (l.children) {
      if (opacity >= 1 && op === 'source-over') {
        drawLayers(ctx, l.children, w, h);
        continue;
      }
      const tmp = createCanvas(w, h);
      drawLayers(tmp.getContext('2d')!, l.children, w, h);
      ctx.save();
      ctx.globalAlpha = opacity;
      ctx.globalCompositeOperation = op;
      ctx.drawImage(tmp, 0, 0);
      ctx.restore();
      releaseCanvas(tmp);
    } else if (l.canvas) {
      ctx.save();
      ctx.globalAlpha = opacity;
      ctx.globalCompositeOperation = op;
      ctx.drawImage(l.canvas, l.left ?? 0, l.top ?? 0);
      ctx.restore();
    }
  }
}

/** Flattened preview (PSD composite image) built from the layer tree. */
export function compositeLayers(layers: Layer[], w: number, h: number): HTMLCanvasElement {
  const c = createCanvas(w, h);
  drawLayers(c.getContext('2d')!, layers, w, h);
  return c;
}

async function renderItem(
  item: PlanItem,
  origin: { x: number; y: number },
  scale: number,
  ctx: ExportContext,
): Promise<Rendered | null> {
  const res = await ctx.bridge.exportNode(
    'png',
    { nodeId: item.node.id, scale, backgroundOnly: item.backgroundOnly },
    ctx.token,
  );
  if (!res.bytes || !res.bytes.byteLength) throw new Error('empty image');
  let canvas = await bytesToCanvas(res.bytes);
  let { left, top } = layerPlacement(item.node.renderBounds, origin, scale);
  if (item.clip) {
    const x1 = Math.floor((item.clip.x - origin.x) * scale);
    const y1 = Math.floor((item.clip.y - origin.y) * scale);
    const x2 = Math.ceil((item.clip.x + item.clip.width - origin.x) * scale);
    const y2 = Math.ceil((item.clip.y + item.clip.height - origin.y) * scale);
    const inter = intersectRect(
      { x: left, y: top, width: canvas.width, height: canvas.height },
      { x: x1, y: y1, width: x2 - x1, height: y2 - y1 },
    );
    if (!inter) {
      releaseCanvas(canvas);
      return null; // completely clipped away by its parent
    }
    if (inter.width !== canvas.width || inter.height !== canvas.height) {
      const cropped = cropCanvas(canvas, inter.x - left, inter.y - top, inter.width, inter.height);
      releaseCanvas(canvas);
      canvas = cropped;
      left = inter.x;
      top = inter.y;
    }
  }
  return { canvas, left, top };
}

function decorate(
  layer: Layer,
  item: PlanItem,
  origin: { x: number; y: number },
  scale: number,
): void {
  const n = item.node;
  if (item.kind === 'text') {
    const seg = n.textSegments?.[0];
    const fill = (n.fills ?? []).find((f) => f.visible)?.color ??
      seg?.color ?? { r: 0, g: 0, b: 0, a: 1 };
    const place = layerPlacement(n.bounds, origin, scale);
    const align =
      n.textAlignHorizontal === 'CENTER'
        ? 'center'
        : n.textAlignHorizontal === 'RIGHT'
          ? 'right'
          : n.textAlignHorizontal === 'JUSTIFIED'
            ? 'justify-all'
            : 'left';
    const lh = typeof n.lineHeight === 'number' ? n.lineHeight * scale : undefined;
    const ls =
      typeof n.letterSpacing === 'number' && n.fontSize ? (n.letterSpacing / n.fontSize) * 1000 : 0;
    layer.text = {
      text: (n.characters ?? '').replace(/\r?\n/g, '\r'),
      transform: [1, 0, 0, 1, place.left, place.top],
      shapeType: 'box',
      boxBounds: [0, 0, n.width * scale, n.height * scale],
      style: {
        font: { name: psFontName(n.fontFamily ?? 'Arial', n.fontStyle ?? 'Regular') },
        fontSize: (n.fontSize ?? 12) * scale,
        fillColor: toPsdColor(fill),
        tracking: Math.round(ls),
        autoLeading: lh === undefined,
        leading: lh,
        underline: n.textDecoration === 'UNDERLINE',
        strikethrough: n.textDecoration === 'STRIKETHROUGH',
      },
      paragraphStyle: { justification: align },
    };
  } else if (item.kind === 'shape') {
    const fill = (n.fills ?? []).find((f) => f.visible)!.color!;
    const r = layerPlacement(n.bounds, origin, scale);
    const w = n.width * scale;
    const h = n.height * scale;
    const knot = (x: number, y: number) => ({ linked: false, points: [x, y, x, y, x, y] });
    layer.vectorFill = { type: 'color', color: toPsdColor(fill) };
    layer.vectorMask = {
      paths: [
        {
          open: false,
          operation: 'combine',
          fillRule: 'non-zero',
          knots: [
            knot(r.left, r.top),
            knot(r.left + w, r.top),
            knot(r.left + w, r.top + h),
            knot(r.left, r.top + h),
          ],
        },
      ],
    };
  }
}

// ------------------------------------------------------------------ export

export async function exportPsd(
  doc: SerializedDocument,
  opts: PsdOptions,
  includeHidden: boolean,
  ctx: ExportContext,
): Promise<ExportOutput> {
  const started = performance.now();
  const warnings: string[] = [];
  const warn = (m: string) => {
    if (!warnings.includes(m)) {
      warnings.push(m);
      ctx.warn(m);
    }
  };
  const roots = doc.roots;
  if (!roots.length) throw new Error('Nothing to export.');
  ctx.progress('Analysing layers', 0);

  const groups: SerializedNode[][] = opts.separateFrames ? roots.map((r) => [r]) : [roots];
  const plans = groups.map((g) => planPsd(g, opts, includeHidden));
  plans.forEach((p) => p.warnings.forEach(warn));

  // pre-flight size validation
  const sizes = groups.map((g) => {
    const box = g.length === 1 ? g[0].bounds : unionRects(g.map((r) => r.bounds));
    return { box, w: Math.round(box.width * opts.scale), h: Math.round(box.height * opts.scale) };
  });
  sizes.forEach((s, i) => {
    if (s.w > PSD_MAX_DIMENSION || s.h > PSD_MAX_DIMENSION) {
      throw new Error(
        `"${groups[i][0].name}" is ${s.w}×${s.h}px at ${opts.scale}×. PSD supports up to ${PSD_MAX_DIMENSION}px per side. Use a smaller scale or export fewer frames.`,
      );
    }
  });
  const estimate = plans.reduce(
    (sum, p) =>
      sum +
      flattenPlan(p.items).reduce(
        (s, i) =>
          s + i.node.renderBounds.width * i.node.renderBounds.height * opts.scale * opts.scale * 4,
        0,
      ),
    0,
  );
  if (estimate > PSD_HARD_LIMIT_BYTES) {
    throw new Error(
      'Estimated PSD size exceeds 2 GB. Export selected frames separately or use 1× scale.',
    );
  }
  if (estimate > PSD_WARN_BYTES) {
    warn('Estimated PSD size exceeds 500 MB. Export selected frames separately or use 1× scale.');
  }

  const allJobs = plans.flatMap((p) => flattenPlan(p.items));
  let done = 0;
  const files: { name: string; data: Uint8Array; mime: string }[] = [];
  const usedNames = new Set<string>();
  let failed = 0;

  for (let gi = 0; gi < groups.length; gi++) {
    ctx.token.throwIfCancelled();
    const g = groups[gi];
    const plan = plans[gi];
    const { box, w, h } = sizes[gi];
    const origin = { x: box.x, y: box.y };
    const jobs = flattenPlan(plan.items);
    const rendered = new Map<PlanItem, Rendered | null>();

    ctx.progress(
      'Exporting images',
      Math.round(10 + (done / Math.max(1, allJobs.length)) * 70),
      g[0].name,
    );
    await runQueue(
      jobs,
      ctx.concurrency,
      async (item) => {
        try {
          rendered.set(item, await renderItem(item, origin, opts.scale, ctx));
        } catch (e) {
          if ((e as Error).name === 'CancelledError') throw e;
          failed++;
          rendered.set(item, null);
          warn(`Layer "${item.name}" could not be rendered and was skipped`);
          logger.error(e);
        }
        done++;
        ctx.progress(
          'Exporting images',
          Math.round(10 + (done / Math.max(1, allJobs.length)) * 70),
          item.name,
        );
      },
      ctx.token,
    );

    ctx.progress('Building document', 82, g[0].name);
    const toLayers = (items: PlanItem[]): Layer[] => {
      const out: Layer[] = [];
      for (const item of items) {
        const n = item.node;
        if (item.kind === 'folder') {
          out.push({
            name: item.name,
            opened: true,
            hidden: !n.visible,
            opacity: n.opacity,
            blendMode: mapBlendMode(n.blendMode, true, warn),
            children: toLayers(item.children ?? []),
          });
        } else {
          const r = rendered.get(item);
          if (!r) continue;
          const layer: Layer = {
            name: item.name,
            left: r.left,
            top: r.top,
            canvas: r.canvas,
            hidden: !n.visible,
            // opacity is already baked into the exported pixels
            opacity: 1,
            blendMode: item.backgroundOnly ? 'normal' : mapBlendMode(n.blendMode, false, warn),
          };
          decorate(layer, item, origin, opts.scale);
          out.push(layer);
        }
      }
      return out;
    };
    const layers = toLayers(plan.items);
    await yieldToUi();
    const composite = compositeLayers(layers, w, h);
    const psd: Psd = { width: w, height: h, children: layers, canvas: composite };
    ctx.progress('Building document', 90, g[0].name);
    await yieldToUi();
    let bytes: Uint8Array;
    try {
      bytes = writePsdUint8Array(psd, { generateThumbnail: true });
    } catch (e) {
      logger.error(e);
      throw new Error(
        `Could not write the PSD for "${g[0].name}". Try a smaller scale or fewer layers.`,
      );
    } finally {
      // release canvas memory
      const free = (ls: Layer[]) =>
        ls.forEach((l) => (l.children ? free(l.children) : releaseCanvas(l.canvas)));
      free(layers);
      releaseCanvas(composite);
    }
    const base =
      g.length === 1
        ? applyFileNamePattern(opts.fileNamePattern, {
            name: g[0].name,
            width: g[0].width,
            height: g[0].height,
            page: g[0].pageName,
            scale: opts.scale,
            index: gi,
          })
        : applyFileNamePattern(opts.fileNamePattern, {
            name: doc.pageName,
            width: w / opts.scale,
            height: h / opts.scale,
            scale: opts.scale,
          });
    files.push({
      name: `${uniqueName(base, usedNames)}.psd`,
      data: bytes,
      mime: 'image/vnd.adobe.photoshop',
    });
  }

  const finalFiles = await packageFiles(files, opts.zip, `${doc.pageName}-psd`, ctx);
  const sum = plans.reduce(
    (a, p) => ({
      processed: a.processed + p.processed,
      preserved: a.preserved + p.preserved,
      rasterized: a.rasterized + p.rasterized,
      text: a.text + p.textPreserved,
    }),
    { processed: 0, preserved: 0, rasterized: 0, text: 0 },
  );
  const report: ConversionReport = {
    format: 'PSD',
    frames: groups.length,
    layersProcessed: sum.processed,
    layersPreserved: sum.preserved,
    layersRasterized: sum.rasterized,
    textLayersPreserved: sum.text,
    imagesEmbedded: allJobs.length - failed,
    unsupportedEffects: doc.stats.unsupportedEffects,
    durationMs: Math.round(performance.now() - started),
    outputBytes: totalBytes(finalFiles),
    files: finalFiles.map((f) => f.name),
    warnings,
    errors: failed ? [`${failed} layer(s) failed to render`] : [],
  };
  return { files: finalFiles, report };
}
