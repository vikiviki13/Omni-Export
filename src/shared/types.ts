import type { Rgba } from './color';

export type ExportFormat = 'psd' | 'illustrator' | 'html';
export type SelectionScope = 'selection' | 'page' | 'all-pages';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SerializedGradientStop {
  position: number;
  color: Rgba;
}

export interface SerializedPaint {
  type: string; // SOLID | GRADIENT_LINEAR | GRADIENT_RADIAL | GRADIENT_ANGULAR | GRADIENT_DIAMOND | IMAGE | ...
  visible: boolean;
  opacity: number;
  blendMode?: string;
  color?: Rgba;
  gradientStops?: SerializedGradientStop[];
  gradientTransform?: number[][];
  imageHash?: string;
  scaleMode?: string;
}

export interface SerializedEffect {
  type: string; // DROP_SHADOW | INNER_SHADOW | LAYER_BLUR | BACKGROUND_BLUR | other (unsupported)
  visible: boolean;
  radius?: number;
  spread?: number;
  offsetX?: number;
  offsetY?: number;
  color?: Rgba;
  blendMode?: string;
}

export interface TextSegment {
  characters: string;
  fontFamily: string;
  fontStyle: string;
  fontWeight: number;
  italic: boolean;
  fontSize: number;
  color?: Rgba;
  textDecoration?: string;
  textCase?: string;
  letterSpacing?: number | string;
  lineHeight?: number | string;
}

export interface SerializedReaction {
  trigger: string;
  actions: Array<{ type: string; navigation?: string; destinationId?: string; url?: string }>;
}

export interface SerializedNode {
  id: string;
  name: string;
  type: string;
  visible: boolean;
  locked?: boolean;
  opacity: number;
  blendMode?: string;
  /** relative to parent */
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  /** origin of the node's transform in document space */
  absoluteX: number;
  absoluteY: number;
  /** absoluteBoundingBox (rotation-aware, excludes strokes/effects) */
  bounds: Rect;
  /** absoluteRenderBounds (includes strokes/effects) – what exportAsync actually renders */
  renderBounds: Rect;
  pageName?: string;
  isMask?: boolean;
  maskType?: string;
  fills?: SerializedPaint[];
  strokes?: SerializedPaint[];
  strokeWeight?: number;
  strokeAlign?: string;
  strokeWeights?: [number, number, number, number]; // top,right,bottom,left when they differ
  strokeDashes?: number[];
  cornerRadius?: number | number[];
  effects?: SerializedEffect[];
  clipsContent?: boolean;
  layoutMode?: string;
  layoutWrap?: string;
  primaryAxisAlignItems?: string;
  counterAxisAlignItems?: string;
  itemSpacing?: number;
  counterAxisSpacing?: number;
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  layoutAlign?: string;
  layoutGrow?: number;
  layoutPositioning?: string;
  layoutSizingHorizontal?: string;
  layoutSizingVertical?: string;
  minWidth?: number | null;
  maxWidth?: number | null;
  minHeight?: number | null;
  maxHeight?: number | null;
  constraints?: { horizontal: string; vertical: string };
  characters?: string;
  fontFamily?: string;
  fontStyle?: string;
  fontSize?: number;
  fontWeight?: number;
  italic?: boolean;
  lineHeight?: number | string;
  letterSpacing?: number | string;
  textAlignHorizontal?: string;
  textAlignVertical?: string;
  textDecoration?: string;
  textCase?: string;
  textAutoResize?: string;
  textSegments?: TextSegment[];
  mixedText?: boolean;
  hasMissingFont?: boolean;
  componentName?: string;
  reactions?: SerializedReaction[];
  css?: Record<string, string>;
  /** Inline SVG markup for icons / vectors / masked groups (HTML export only). */
  svg?: string;
  children?: SerializedNode[];
}

export interface SelectionStats {
  rootCount: number;
  nodeCount: number;
  selectedNames: string[];
  totalWidth: number;
  totalHeight: number;
  textCount: number;
  vectorCount: number;
  imageCount: number;
  unsupportedEffects: number;
  hiddenCount: number;
  /** summed pixel area of leaf layers at 1x (used for size estimates) */
  leafPixelArea: number;
  warnings: string[];
}

export interface ImageAsset {
  bytes: Uint8Array;
  mime: string;
}

export interface SerializedDocument {
  scope: SelectionScope;
  pageName: string;
  roots: SerializedNode[];
  stats: SelectionStats;
  images: Record<string, ImageAsset>;
  flowStartIds: string[];
  detail: 'summary' | 'full';
}

export interface SelectionOptions {
  scope: SelectionScope;
  includeHidden: boolean;
  detail: 'summary' | 'full';
  includeCss: boolean;
  includeSvg: boolean;
  includeImages: boolean;
}

export type NodeExportKind = 'png' | 'svg' | 'pdf';

export interface NodeExportRequest {
  requestId: number;
  sessionId: number;
  nodeId: string;
  scale?: number;
  /** render only the node's own fills/strokes/effects (children hidden), opacity forced to 1 */
  backgroundOnly?: boolean;
  /** drop the node's own fills (transparent background) */
  transparentBackground?: boolean;
  svgOutlineText?: boolean;
  svgIdAttribute?: boolean;
  svgSimplifyStroke?: boolean;
}

export interface ProgressData {
  stage: string;
  percent: number;
  layerName?: string;
  warnings?: number;
}

export interface ErrorData {
  message: string;
  requestId?: number;
  detail?: string;
}

export interface NodeExportResult {
  requestId: number;
  kind: NodeExportKind;
  bytes?: Uint8Array;
  svg?: string;
}

export type PluginToUIMessage =
  | { type: 'SELECTION_DATA'; payload: SerializedDocument; requestId: number }
  | { type: 'SETTINGS_LOADED'; payload: unknown }
  | { type: 'NODE_EXPORT_RESULT'; payload: NodeExportResult }
  | { type: 'EXPORT_PROGRESS'; payload: ProgressData }
  | { type: 'EXPORT_ERROR'; payload: ErrorData };

export type UIToPluginMessage =
  | { type: 'REQUEST_SELECTION'; payload: SelectionOptions; requestId: number }
  | { type: 'REQUEST_NODE_PNG'; payload: NodeExportRequest }
  | { type: 'REQUEST_NODE_SVG'; payload: NodeExportRequest }
  | { type: 'REQUEST_NODE_PDF'; payload: NodeExportRequest }
  | { type: 'LOAD_SETTINGS' }
  | { type: 'SAVE_SETTINGS'; payload: unknown }
  | { type: 'NOTIFY'; payload: { message: string; error?: boolean } }
  | { type: 'RESIZE'; payload: { width: number; height: number } }
  | { type: 'CANCEL_EXPORT'; payload?: { sessionId: number } }
  | { type: 'CLOSE_PLUGIN' };

export interface ConversionReport {
  format: 'PSD' | 'SVG' | 'PDF' | 'HTML';
  frames: number;
  layersProcessed: number;
  layersPreserved: number;
  layersRasterized: number;
  textLayersPreserved: number;
  imagesEmbedded: number;
  unsupportedEffects: number;
  durationMs: number;
  outputBytes: number;
  files: string[];
  warnings: string[];
  errors: string[];
}
