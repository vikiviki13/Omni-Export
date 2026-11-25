import { sanitizeId } from './sanitize';

/**
 * Makes every id in an SVG string valid and unique (shared `used` set across files),
 * and rewrites url(#id), href="#id" and xlink:href="#id" references accordingly.
 */
export function sanitizeSvgIds(svg: string, used: Set<string>): string {
  const map = new Map<string, string>();
  const ids: string[] = [];
  svg.replace(/\sid="([^"]*)"/g, (_m, id: string) => {
    ids.push(id);
    return _m;
  });
  for (const id of ids) {
    if (map.has(id)) continue;
    const base = sanitizeId(id, 'id');
    let candidate = base;
    let i = 2;
    while (used.has(candidate)) candidate = `${base}-${i++}`;
    used.add(candidate);
    map.set(id, candidate);
  }
  // Duplicate ids inside one document: first keeps the mapping, later ones get fresh names.
  const seen = new Set<string>();
  let out = svg.replace(/\sid="([^"]*)"/g, (_m, id: string) => {
    let target = map.get(id) as string;
    if (seen.has(id)) {
      let candidate = `${target}-dup`;
      let i = 2;
      while (used.has(candidate)) candidate = `${target}-dup${i++}`;
      used.add(candidate);
      target = candidate;
    } else seen.add(id);
    return ` id="${target}"`;
  });
  out = out.replace(/url\(#([^)]+)\)/g, (m, id: string) =>
    map.has(id) ? `url(#${map.get(id)})` : m,
  );
  out = out.replace(/((?:xlink:)?href)="#([^"]+)"/g, (m, attr: string, id: string) =>
    map.has(id) ? `${attr}="#${map.get(id)}"` : m,
  );
  return out;
}

export function optimizeSvg(svg: string): string {
  return svg
    .replace(/<\?xml[^>]*\?>\s*/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<metadata[\s\S]*?<\/metadata>/g, '')
    .replace(/>\s+</g, '><')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** Returns an error string when the SVG is not well-formed XML. */
export function validateSvg(svg: string): string | null {
  if (!/<svg[\s>]/.test(svg)) return 'No <svg> element found';
  if (typeof DOMParser === 'undefined') return null;
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const err = doc.querySelector('parsererror');
  return err ? 'Malformed SVG' : null;
}

export function svgSize(svg: string): { width: number; height: number } {
  const w = /<svg[^>]*\swidth="([\d.]+)/.exec(svg);
  const h = /<svg[^>]*\sheight="([\d.]+)/.exec(svg);
  return { width: w ? parseFloat(w[1]) : 100, height: h ? parseFloat(h[1]) : 100 };
}
