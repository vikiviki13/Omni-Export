import type { SelectionOptions } from './types';

export const PLUGIN_NAME = 'Omni Export';
export const UI_WIDTH = 420;
export const UI_HEIGHT = 620;
export const STORAGE_KEY = 'omni-export-settings-v1';
export const PSD_MAX_DIMENSION = 30000;
export const PSD_WARN_BYTES = 500 * 1024 * 1024;
export const PSD_HARD_LIMIT_BYTES = 2 * 1024 * 1024 * 1024;
export const CANVAS_MAX_PIXELS = 120_000_000;
export const CACHE_MAX_BYTES = 256 * 1024 * 1024;

export const CONTAINER_TYPES = [
  'FRAME',
  'GROUP',
  'COMPONENT',
  'COMPONENT_SET',
  'INSTANCE',
  'SECTION',
];
export const VECTOR_TYPES = ['VECTOR', 'BOOLEAN_OPERATION', 'STAR', 'POLYGON', 'LINE'];
export const UNSUPPORTED_NODE_TYPES = [
  'SLICE',
  'CONNECTOR',
  'STICKY',
  'SHAPE_WITH_TEXT',
  'CODE_BLOCK',
  'STAMP',
  'WIDGET',
  'EMBED',
  'LINK_UNFURL',
  'MEDIA',
  'TABLE',
  'TABLE_CELL',
  'HIGHLIGHT',
  'WASHI_TAPE',
];

export const DEFAULT_SELECTION_OPTIONS: SelectionOptions = {
  scope: 'selection',
  includeHidden: false,
  detail: 'summary',
  includeCss: false,
  includeSvg: false,
  includeImages: false,
};
