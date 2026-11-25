import { DEFAULT_SELECTION_OPTIONS, STORAGE_KEY, UI_HEIGHT, UI_WIDTH } from '../shared/constants';
import type {
  NodeExportKind,
  NodeExportRequest,
  SelectionOptions,
  UIToPluginMessage,
} from '../shared/types';
import { isUIMessage, postToUI } from './message-types';
import { readSelection } from './selection-reader';

figma.showUI(__html__, {
  width: UI_WIDTH,
  height: UI_HEIGHT,
  themeColors: true,
  title: 'Omni Export',
});

let lastOptions: SelectionOptions = DEFAULT_SELECTION_OPTIONS;
const cancelledSessions = new Set<number>();

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

async function pushSelection(options: SelectionOptions, requestId: number) {
  try {
    const payload = await readSelection(options);
    postToUI({ type: 'SELECTION_DATA', payload, requestId });
  } catch (e) {
    postToUI({
      type: 'EXPORT_ERROR',
      payload: { message: 'Could not read the selection.', detail: errText(e), requestId },
    });
  }
}

/** Clone → mutate → export → always remove the clone. The document ends up unchanged. */
async function exportWithClone(
  node: SceneNode,
  mutate: (c: any) => void,
  run: (n: SceneNode) => Promise<any>,
) {
  const clone = node.clone();
  try {
    mutate(clone);
    return await run(clone);
  } finally {
    try {
      clone.remove();
    } catch {
      /* already removed */
    }
  }
}

async function handleNodeExport(kind: NodeExportKind, req: NodeExportRequest) {
  const fail = (message: string, detail?: string) =>
    postToUI({ type: 'EXPORT_ERROR', payload: { message, detail, requestId: req.requestId } });
  if (cancelledSessions.has(req.sessionId)) return fail('cancelled');
  const node = await figma.getNodeByIdAsync(req.nodeId);
  if (!node || node.removed)
    return fail('A layer was removed from the document during export.', req.nodeId);
  if (!('exportAsync' in node))
    return fail(`Layer type ${node.type} cannot be exported.`, req.nodeId);
  const scene = node as SceneNode;

  const needsClone = !!req.backgroundOnly || !!req.transparentBackground || !scene.visible;
  const mutate = (c: any) => {
    if (!c.visible) c.visible = true;
    if (req.backgroundOnly) {
      if ('children' in c) for (const ch of c.children) ch.visible = false;
      c.opacity = 1;
      if ('blendMode' in c) c.blendMode = 'NORMAL';
      if ('isMask' in c && c.isMask) c.isMask = false;
    }
    if (req.transparentBackground && 'fills' in c) c.fills = [];
  };

  const settings: any =
    kind === 'png'
      ? { format: 'PNG', constraint: { type: 'SCALE', value: req.scale ?? 1 } }
      : kind === 'pdf'
        ? { format: 'PDF' }
        : {
            format: 'SVG_STRING',
            svgOutlineText: req.svgOutlineText ?? false,
            svgIdAttribute: req.svgIdAttribute ?? true,
            svgSimplifyStroke: req.svgSimplifyStroke ?? true,
          };
  try {
    const run = (n: SceneNode) => (n as any).exportAsync(settings);
    const data = needsClone ? await exportWithClone(scene, mutate, run) : await run(scene);
    if (cancelledSessions.has(req.sessionId)) return fail('cancelled');
    if (kind === 'svg')
      postToUI({
        type: 'NODE_EXPORT_RESULT',
        payload: { requestId: req.requestId, kind, svg: data as string },
      });
    else
      postToUI({
        type: 'NODE_EXPORT_RESULT',
        payload: { requestId: req.requestId, kind, bytes: data as Uint8Array },
      });
  } catch (e) {
    fail(`Could not export "${scene.name}" as ${kind.toUpperCase()}.`, errText(e));
  }
}

figma.ui.onmessage = async (raw: unknown) => {
  if (!isUIMessage(raw)) return;
  const msg: UIToPluginMessage = raw;
  try {
    switch (msg.type) {
      case 'REQUEST_SELECTION':
        if (msg.payload.detail === 'summary') lastOptions = msg.payload;
        await pushSelection(msg.payload, msg.requestId);
        break;
      case 'REQUEST_NODE_PNG':
        await handleNodeExport('png', msg.payload);
        break;
      case 'REQUEST_NODE_SVG':
        await handleNodeExport('svg', msg.payload);
        break;
      case 'REQUEST_NODE_PDF':
        await handleNodeExport('pdf', msg.payload);
        break;
      case 'LOAD_SETTINGS':
        postToUI({
          type: 'SETTINGS_LOADED',
          payload: (await figma.clientStorage.getAsync(STORAGE_KEY)) ?? null,
        });
        break;
      case 'SAVE_SETTINGS':
        await figma.clientStorage.setAsync(STORAGE_KEY, msg.payload);
        break;
      case 'NOTIFY':
        figma.notify(msg.payload.message, { error: !!msg.payload.error });
        break;
      case 'RESIZE':
        figma.ui.resize(
          Math.max(360, Math.round(msg.payload.width)),
          Math.max(420, Math.round(msg.payload.height)),
        );
        break;
      case 'CANCEL_EXPORT':
        if (msg.payload) cancelledSessions.add(msg.payload.sessionId);
        break;
      case 'CLOSE_PLUGIN':
        figma.closePlugin();
        break;
    }
  } catch (e) {
    postToUI({
      type: 'EXPORT_ERROR',
      payload: { message: 'Unexpected plugin error.', detail: errText(e) },
    });
  }
};

let timer: ReturnType<typeof setTimeout> | undefined;
function schedulePush() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void pushSelection(lastOptions, 0), 200);
}
figma.on('selectionchange', schedulePush);
figma.on('currentpagechange', schedulePush);
