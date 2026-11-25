import type { ConversionReport, ExportFormat, SelectionScope } from '../../shared/types';
import type { CancelToken } from '../utilities/queue';
import type { Bridge } from '../bridge';

export type PsdMode = 'fidelity' | 'editable';

export interface PsdOptions {
  mode: PsdMode;
  preserveGroups: boolean;
  flattenInstances: boolean;
  separateFrames: boolean;
  zip: boolean;
  scale: 1 | 2 | 3;
  background: 'transparent' | 'frame';
  fileNamePattern: string;
}

export type IllustratorFormat = 'svg' | 'pdf';
export type IllustratorOutput = 'files' | 'zip' | 'combined';

export interface IllustratorOptions {
  format: IllustratorFormat;
  output: IllustratorOutput;
  outlineText: boolean;
  optimize: boolean;
  layerIds: boolean;
  rasterizeUnsupported: boolean;
  includeBackground: boolean;
  fileNamePattern: string;
}

export interface HtmlOptions {
  layout: 'pixel' | 'responsive';
  zipProject: boolean;
  interactions: boolean;
}

export interface Settings {
  tab: ExportFormat;
  scope: SelectionScope;
  includeHidden: boolean;
  concurrency: number;
  psd: PsdOptions;
  illustrator: IllustratorOptions;
  html: HtmlOptions;
}

export interface ExportFile {
  name: string;
  data: Uint8Array | string;
  mime: string;
}

export interface ExportOutput {
  files: ExportFile[];
  report: ConversionReport;
}

export const STAGES = [
  'Reading selection',
  'Analysing layers',
  'Exporting vectors',
  'Exporting images',
  'Building document',
  'Compressing files',
  'Preparing download',
  'Complete',
] as const;
export type Stage = (typeof STAGES)[number];

export interface ExportContext {
  bridge: Bridge;
  token: CancelToken;
  concurrency: number;
  progress: (stage: Stage, percent: number, layerName?: string) => void;
  warn: (message: string) => void;
}
