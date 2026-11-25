import type { ExportFormat, SelectionOptions, SerializedDocument } from '../shared/types';
import type { Bridge } from './bridge';
import { exportHtml, type HtmlResult } from './exporters/html-exporter';
import { exportPdf } from './exporters/pdf-exporter';
import { exportPsd } from './exporters/psd-exporter';
import { exportSvg } from './exporters/svg-exporter';
import type { ExportContext, ExportOutput, Settings } from './types/export-types';

export function selectionOptions(s: Settings, format: ExportFormat | 'summary'): SelectionOptions {
  const full = format !== 'summary';
  const html = format === 'html';
  return {
    scope: s.scope,
    includeHidden: s.includeHidden,
    detail: full ? 'full' : 'summary',
    includeCss: html,
    includeSvg: html,
    includeImages: html,
  };
}

export async function readDocument(
  bridge: Bridge,
  s: Settings,
  format: ExportFormat,
): Promise<SerializedDocument> {
  const doc = await bridge.requestSelection(selectionOptions(s, format));
  if (!doc.roots.length) throw new Error('Select at least one frame or layer.');
  return doc;
}

export async function runExport(
  s: Settings,
  doc: SerializedDocument,
  ctx: ExportContext,
  altOverrides: Record<string, string>,
): Promise<ExportOutput & { htmlResult?: HtmlResult }> {
  switch (s.tab) {
    case 'psd':
      return exportPsd(doc, s.psd, s.includeHidden, ctx);
    case 'illustrator':
      return s.illustrator.format === 'pdf'
        ? exportPdf(doc, s.illustrator, ctx)
        : exportSvg(doc, s.illustrator, ctx);
    case 'html': {
      const r = await exportHtml(doc, s.html, s.includeHidden, altOverrides, ctx);
      return { files: r.files, report: r.report, htmlResult: r.result };
    }
  }
}
