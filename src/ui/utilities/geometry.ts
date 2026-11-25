import type { Rect } from '../../shared/types';

export interface Point {
  x: number;
  y: number;
}

/** Child position relative to the selected root (never raw document coordinates). */
export function toLocal(abs: Point, rootAbs: Point): Point {
  return { x: abs.x - rootAbs.x, y: abs.y - rootAbs.y };
}

export function scaleRect(r: Rect, s: number): Rect {
  return { x: r.x * s, y: r.y * s, width: r.width * s, height: r.height * s };
}

export function intersectRect(a: Rect, b: Rect): Rect | null {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);
  return x2 > x1 && y2 > y1 ? { x: x1, y: y1, width: x2 - x1, height: y2 - y1 } : null;
}

export function unionRects(rects: Rect[]): Rect {
  if (!rects.length) return { x: 0, y: 0, width: 0, height: 0 };
  const x1 = Math.min(...rects.map((r) => r.x));
  const y1 = Math.min(...rects.map((r) => r.y));
  const x2 = Math.max(...rects.map((r) => r.x + r.width));
  const y2 = Math.max(...rects.map((r) => r.y + r.height));
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

/** Pixel placement of a rendered layer inside a PSD whose origin is `origin`. */
export function layerPlacement(
  renderBounds: Rect,
  origin: Point,
  scale: number,
): { left: number; top: number } {
  const l = toLocal({ x: renderBounds.x, y: renderBounds.y }, origin);
  return { left: Math.round(l.x * scale), top: Math.round(l.y * scale) };
}

export const px = (n: number): string => {
  const v = Math.round(n * 100) / 100;
  return v === 0 ? '0' : `${v}px`;
};
