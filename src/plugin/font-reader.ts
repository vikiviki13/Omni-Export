import { fontStack, parseFontStyle, psFontName } from '../shared/font-utils';

export { fontStack, parseFontStyle, psFontName };

/** Unique "Family Style" pairs used by a text node (handles mixed fonts). */
export function readTextFonts(node: TextNode): Array<{ family: string; style: string }> {
  const out = new Map<string, { family: string; style: string }>();
  const fn = node.fontName;
  if (fn !== figma.mixed) {
    out.set(`${fn.family}|${fn.style}`, { family: fn.family, style: fn.style });
  } else {
    for (const s of node.getStyledTextSegments(['fontName'])) {
      out.set(`${s.fontName.family}|${s.fontName.style}`, {
        family: s.fontName.family,
        style: s.fontName.style,
      });
    }
  }
  return Array.from(out.values());
}
