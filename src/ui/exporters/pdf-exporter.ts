import type { ConversionReport, SerializedDocument, SerializedNode } from '../../shared/types';
import type { ExportContext, ExportOutput, IllustratorOptions } from '../types/export-types';
import { applyFileNamePattern, uniqueName } from '../utilities/sanitize';
import { runQueue } from '../utilities/queue';
import { packageFiles, totalBytes } from './zip-exporter';

const count = (n: SerializedNode): number =>
  1 + (n.children ?? []).reduce((s, c) => s + count(c), 0);

export async function exportPdf(
  doc: SerializedDocument,
  opts: IllustratorOptions,
  ctx: ExportContext,
): Promise<ExportOutput> {
  const started = performance.now();
  const roots = doc.roots;
  if (!roots.length) throw new Error('Nothing to export.');
  const warnings: string[] = [];
  const usedNames = new Set<string>();
  let done = 0;
  ctx.progress('Exporting vectors', 0);
  const files = await runQueue(
    roots,
    ctx.concurrency,
    async (root, i) => {
      const res = await ctx.bridge.exportNode(
        'pdf',
        { nodeId: root.id, transparentBackground: !opts.includeBackground },
        ctx.token,
      );
      if (!res.bytes || !res.bytes.byteLength)
        throw new Error(`PDF export of "${root.name}" produced no data`);
      done++;
      ctx.progress('Exporting vectors', Math.round((done / roots.length) * 80), root.name);
      return {
        root,
        index: i,
        bytes: res.bytes,
      };
    },
    ctx.token,
  );
  ctx.progress('Building document', 85);
  const out = files.map((f) => ({
    name: `${uniqueName(applyFileNamePattern(opts.fileNamePattern, { name: f.root.name, width: f.root.width, height: f.root.height, page: f.root.pageName, index: f.index }), usedNames)}.pdf`,
    data: f.bytes,
    mime: 'application/pdf',
  }));
  if (doc.stats.unsupportedEffects > 0) {
    const m = 'Some effects may be flattened or dropped by Figma\u2019s PDF export';
    warnings.push(m);
    ctx.warn(m);
  }
  const finalFiles = await packageFiles(out, opts.output !== 'files', `${doc.pageName}-pdf`, ctx);
  const total = roots.reduce((s, r) => s + count(r), 0);
  const report: ConversionReport = {
    format: 'PDF',
    frames: roots.length,
    layersProcessed: total,
    layersPreserved: total,
    layersRasterized: 0,
    textLayersPreserved: doc.stats.textCount,
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
