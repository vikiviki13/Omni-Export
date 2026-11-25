import type { ConversionReport, SerializedDocument, SerializedNode } from '../../shared/types';
import type {
  ExportContext,
  ExportFile,
  ExportOutput,
  IllustratorOptions,
} from '../types/export-types';
import { toDataUrl, utf8 } from '../utilities/base64';
import { applyFileNamePattern, escapeXml, sanitizeId, uniqueName } from '../utilities/sanitize';
import { optimizeSvg, sanitizeSvgIds, svgSize, validateSvg } from '../utilities/svg';
import { runQueue } from '../utilities/queue';
import { packageFiles, totalBytes } from './zip-exporter';

const GAP = 100;

function countNodes(n: SerializedNode): number {
  return 1 + (n.children ?? []).reduce((s, c) => s + countNodes(c), 0);
}

/** Wraps a PNG render in a valid SVG (used for frames with effects SVG cannot express). */
function rasterSvg(name: string, w: number, h: number, png: Uint8Array): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    `<title>${escapeXml(name)}</title><image id="raster" width="${w}" height="${h}" xlink:href="${toDataUrl(png, 'image/png')}"/></svg>`
  );
}

function hasUnsupportedEffects(n: SerializedNode): boolean {
  if (
    (n.effects ?? []).some(
      (e) =>
        e.visible &&
        e.type !== 'DROP_SHADOW' &&
        e.type !== 'INNER_SHADOW' &&
        e.type !== 'LAYER_BLUR',
    )
  )
    return true;
  return (n.children ?? []).some(hasUnsupportedEffects);
}

/** Positions several SVG artboards side by side inside one SVG document. */
export function combineSvgs(
  items: Array<{ name: string; svg: string }>,
  used: Set<string>,
): string {
  let x = 0;
  let maxH = 0;
  const parts: string[] = [];
  for (const it of items) {
    const { width, height } = svgSize(it.svg);
    const inner = it.svg.replace(/<\?xml[^>]*\?>\s*/g, '');
    const open = inner.match(/<svg\b[^>]*>/);
    if (!open) continue;
    const nested = inner.replace(open[0], open[0].replace(/<svg\b/, `<svg x="${x}" y="0"`));
    parts.push(`<g id="${uniqueName(sanitizeId(`artboard-${it.name}`), used)}">${nested}</g>`);
    x += width + GAP;
    maxH = Math.max(maxH, height);
  }
  const total = Math.max(1, x - GAP);
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${total}" height="${maxH}" viewBox="0 0 ${total} ${maxH}">${parts.join('')}</svg>`;
}

export async function exportSvg(
  doc: SerializedDocument,
  opts: IllustratorOptions,
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
  const usedIds = new Set<string>();
  const usedNames = new Set<string>();
  let rasterized = 0;
  let done = 0;
  ctx.progress('Exporting vectors', 0);

  const results = await runQueue(
    roots,
    ctx.concurrency,
    async (root, i) => {
      let svg: string;
      const unsupported = hasUnsupportedEffects(root);
      if (unsupported && opts.rasterizeUnsupported) {
        const png = await ctx.bridge.exportNode(
          'png',
          { nodeId: root.id, scale: 2, transparentBackground: !opts.includeBackground },
          ctx.token,
        );
        if (!png.bytes) throw new Error(`Could not rasterize "${root.name}"`);
        svg = rasterSvg(root.name, Math.round(root.width), Math.round(root.height), png.bytes);
        rasterized++;
        warn(
          `"${root.name}" contains effects SVG cannot express and was embedded as a raster image`,
        );
      } else {
        const res = await ctx.bridge.exportNode(
          'svg',
          {
            nodeId: root.id,
            svgOutlineText: opts.outlineText,
            svgIdAttribute: opts.layerIds,
            svgSimplifyStroke: true,
            transparentBackground: !opts.includeBackground,
          },
          ctx.token,
        );
        svg = res.svg ?? '';
        if (unsupported)
          warn(
            `Background blur or other effects in "${root.name}" are not supported by SVG and may be dropped`,
          );
      }
      const problem = validateSvg(svg);
      if (problem) throw new Error(`${problem} for "${root.name}"`);
      done++;
      ctx.progress('Exporting vectors', Math.round((done / roots.length) * 70), root.name);
      return { root, svg, index: i };
    },
    ctx.token,
  );

  ctx.progress('Building document', 75);
  const processed: Array<{ name: string; svg: string; root: SerializedNode }> = [];
  for (const r of results) {
    let svg = r.svg;
    // unique, valid ids across all artboards
    svg = sanitizeSvgIds(svg, usedIds);
    if (opts.optimize) svg = optimizeSvg(svg);
    if (!/xmlns="http:\/\/www\.w3\.org\/2000\/svg"/.test(svg))
      svg = svg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
    processed.push({ name: r.root.name, svg, root: r.root });
  }

  let files: ExportFile[] = [];
  if (opts.output === 'combined') {
    const combined = combineSvgs(processed, usedIds);
    files = [
      {
        name: `${uniqueName(applyFileNamePattern(opts.fileNamePattern, { name: `${doc.pageName}-artboards`, width: 0, height: 0 }), usedNames)}.svg`,
        data: utf8(combined),
        mime: 'image/svg+xml',
      },
    ];
  } else {
    files = processed.map((p, i) => ({
      name: `${uniqueName(applyFileNamePattern(opts.fileNamePattern, { name: p.name, width: p.root.width, height: p.root.height, page: p.root.pageName, index: i }), usedNames)}.svg`,
      data: utf8(p.svg),
      mime: 'image/svg+xml',
    }));
  }
  const finalFiles = await packageFiles(files, opts.output === 'zip', `${doc.pageName}-svg`, ctx);

  const totalLayers = roots.reduce((s, r) => s + countNodes(r), 0);
  const report: ConversionReport = {
    format: 'SVG',
    frames: roots.length,
    layersProcessed: totalLayers,
    layersPreserved: totalLayers - rasterized,
    layersRasterized: rasterized,
    textLayersPreserved: opts.outlineText ? 0 : doc.stats.textCount,
    imagesEmbedded: doc.stats.imageCount,
    unsupportedEffects: doc.stats.unsupportedEffects,
    durationMs: Math.round(performance.now() - started),
    outputBytes: totalBytes(finalFiles),
    files: finalFiles.map((f) => f.name),
    warnings,
    errors: [],
  };
  return { files: finalFiles, report };
}
