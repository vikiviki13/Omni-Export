import type { ExportFormat, SelectionScope } from '../../shared/types';
import type { HtmlOptions, IllustratorOptions, PsdOptions, Settings } from '../types/export-types';

export const DEFAULT_SETTINGS: Settings = {
  tab: 'psd',
  scope: 'selection',
  includeHidden: false,
  concurrency: 3,
  psd: {
    mode: 'editable',
    preserveGroups: true,
    flattenInstances: false,
    separateFrames: true,
    zip: true,
    scale: 1,
    background: 'frame',
    fileNamePattern: '{name}-{width}',
  },
  illustrator: {
    format: 'svg',
    output: 'zip',
    outlineText: false,
    optimize: true,
    layerIds: true,
    rasterizeUnsupported: false,
    includeBackground: true,
    fileNamePattern: '{name}',
  },
  html: { layout: 'pixel', zipProject: false, interactions: true },
};

const oneOf = <T extends string | number>(v: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(v as T) ? (v as T) : fallback;
const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);
const str = (v: unknown, fallback: string) =>
  typeof v === 'string' && v.trim() ? v.slice(0, 120) : fallback;
const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' ? (v as Record<string, unknown>) : {};

/** Coerces untrusted/stored values into a valid Settings object. */
export function validateSettings(raw: unknown): Settings {
  const r = obj(raw);
  const d = DEFAULT_SETTINGS;
  const p = obj(r.psd);
  const i = obj(r.illustrator);
  const h = obj(r.html);
  const psd: PsdOptions = {
    mode: oneOf(p.mode, ['fidelity', 'editable'] as const, d.psd.mode),
    preserveGroups: bool(p.preserveGroups, d.psd.preserveGroups),
    flattenInstances: bool(p.flattenInstances, d.psd.flattenInstances),
    separateFrames: bool(p.separateFrames, d.psd.separateFrames),
    zip: bool(p.zip, d.psd.zip),
    scale: oneOf(p.scale, [1, 2, 3] as const, d.psd.scale),
    background: oneOf(p.background, ['transparent', 'frame'] as const, d.psd.background),
    fileNamePattern: str(p.fileNamePattern, d.psd.fileNamePattern),
  };
  const format = oneOf(i.format, ['svg', 'pdf'] as const, d.illustrator.format);
  let output = oneOf(i.output, ['files', 'zip', 'combined'] as const, d.illustrator.output);
  if (format === 'pdf' && output === 'combined') output = 'zip';
  const illustrator: IllustratorOptions = {
    format,
    output,
    outlineText: bool(i.outlineText, d.illustrator.outlineText),
    optimize: bool(i.optimize, d.illustrator.optimize),
    layerIds: bool(i.layerIds, d.illustrator.layerIds),
    rasterizeUnsupported: bool(i.rasterizeUnsupported, d.illustrator.rasterizeUnsupported),
    includeBackground: bool(i.includeBackground, d.illustrator.includeBackground),
    fileNamePattern: str(i.fileNamePattern, d.illustrator.fileNamePattern),
  };
  const html: HtmlOptions = {
    layout: oneOf(h.layout, ['pixel', 'responsive'] as const, d.html.layout),
    zipProject: bool(h.zipProject, d.html.zipProject),
    interactions: bool(h.interactions, d.html.interactions),
  };
  const conc = typeof r.concurrency === 'number' ? Math.round(r.concurrency) : d.concurrency;
  return {
    tab: oneOf(r.tab as ExportFormat, ['psd', 'illustrator', 'html'] as const, d.tab),
    scope: oneOf(r.scope as SelectionScope, ['selection', 'page', 'all-pages'] as const, d.scope),
    includeHidden: bool(r.includeHidden, d.includeHidden),
    concurrency: Math.min(8, Math.max(1, conc)),
    psd,
    illustrator,
    html,
  };
}
