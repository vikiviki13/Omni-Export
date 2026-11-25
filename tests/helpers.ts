import type { SerializedNode } from '../src/shared/types';

export function node(p: Partial<SerializedNode> & { name: string; type: string }): SerializedNode {
  const w = p.width ?? 100;
  const h = p.height ?? 50;
  const x = p.x ?? 0;
  const y = p.y ?? 0;
  const base: SerializedNode = {
    id: p.id ?? `id-${p.name}`,
    visible: true,
    opacity: 1,
    x,
    y,
    width: w,
    height: h,
    rotation: 0,
    absoluteX: p.absoluteX ?? x,
    absoluteY: p.absoluteY ?? y,
    bounds: { x: p.absoluteX ?? x, y: p.absoluteY ?? y, width: w, height: h },
    renderBounds: { x: p.absoluteX ?? x, y: p.absoluteY ?? y, width: w, height: h },
    ...p,
  };
  return base;
}
