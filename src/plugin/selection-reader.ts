import { createStats, serializeNode, type SerializeContext } from './node-serializer';
import type { SelectionOptions, SerializedDocument, SerializedNode } from '../shared/types';

function pageOf(node: BaseNode): PageNode | null {
  let p: BaseNode | null = node;
  while (p && p.type !== 'PAGE') p = p.parent;
  return p as PageNode | null;
}

const isScene = (n: BaseNode): n is SceneNode => n.type !== 'PAGE' && n.type !== 'DOCUMENT';

async function collectRoots(options: SelectionOptions): Promise<SceneNode[]> {
  let roots: SceneNode[] = [];
  const keep = (n: SceneNode) => options.includeHidden || n.visible;
  if (options.scope === 'selection') {
    roots = [...figma.currentPage.selection];
  } else if (options.scope === 'page') {
    await figma.currentPage.loadAsync();
    roots = figma.currentPage.children.filter(keep);
  } else {
    await figma.loadAllPagesAsync();
    for (const page of figma.root.children) roots.push(...page.children.filter(keep));
  }
  // drop nodes whose ancestor is also a root (avoid exporting twice)
  const ids = new Set(roots.map((r) => r.id));
  return roots.filter((r) => {
    let p = r.parent;
    while (p && isScene(p)) {
      if (ids.has(p.id)) return false;
      p = p.parent;
    }
    return true;
  });
}

export async function readSelection(options: SelectionOptions): Promise<SerializedDocument> {
  const roots = await collectRoots(options);
  const stats = createStats();
  const ctx: SerializeContext = { options, stats, images: {}, counter: 0 };
  const out: SerializedNode[] = [];
  for (const r of roots) {
    ctx.pageName = pageOf(r)?.name;
    const sn = await serializeNode(r, ctx, true);
    if (sn) out.push(sn);
  }
  stats.rootCount = out.length;
  stats.selectedNames = out.map((r) => r.name);
  if (out.length) {
    const x1 = Math.min(...out.map((r) => r.bounds.x));
    const y1 = Math.min(...out.map((r) => r.bounds.y));
    const x2 = Math.max(...out.map((r) => r.bounds.x + r.bounds.width));
    const y2 = Math.max(...out.map((r) => r.bounds.y + r.bounds.height));
    stats.totalWidth = Math.round(x2 - x1);
    stats.totalHeight = Math.round(y2 - y1);
  }
  return {
    scope: options.scope,
    pageName: figma.currentPage.name,
    roots: out,
    stats,
    images: ctx.images,
    flowStartIds:
      options.detail === 'full' ? figma.currentPage.flowStartingPoints.map((f) => f.nodeId) : [],
    detail: options.detail,
  };
}
