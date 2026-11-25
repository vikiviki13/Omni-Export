import JSZip from 'jszip';
import type { ExportContext, ExportFile } from '../types/export-types';
import { utf8 } from '../utilities/base64';
import { sanitizeFileName } from '../utilities/sanitize';

export async function zipFiles(
  files: ExportFile[],
  onProgress?: (percent: number) => void,
): Promise<Uint8Array> {
  const zip = new JSZip();
  for (const f of files)
    zip.file(f.name, typeof f.data === 'string' ? utf8(f.data) : f.data, { binary: true });
  return zip.generateAsync(
    {
      type: 'uint8array',
      compression: 'DEFLATE',
      compressionOptions: { level: 4 },
      streamFiles: true,
    },
    (m) => onProgress?.(m.percent),
  );
}

/** Zips when asked and when there is more than one file; otherwise returns the files unchanged. */
export async function packageFiles(
  files: ExportFile[],
  zip: boolean,
  zipName: string,
  ctx: ExportContext,
): Promise<ExportFile[]> {
  if (!zip || files.length <= 1) return files;
  ctx.token.throwIfCancelled();
  ctx.progress('Compressing files', 0);
  const data = await zipFiles(files, (p) => ctx.progress('Compressing files', p));
  return [{ name: `${sanitizeFileName(zipName)}.zip`, data, mime: 'application/zip' }];
}

export const totalBytes = (files: ExportFile[]) =>
  files.reduce(
    (n, f) => n + (typeof f.data === 'string' ? utf8(f.data).length : f.data.byteLength),
    0,
  );
