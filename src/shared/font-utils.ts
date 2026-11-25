export interface ParsedFontStyle {
  weight: number;
  italic: boolean;
}

const WEIGHTS: Array<[RegExp, number]> = [
  [/(extra|ultra)?thin|hairline/, 100],
  [/(extra|ultra)light/, 200],
  [/light/, 300],
  [/(semi|demi)bold/, 600],
  [/(extra|ultra)bold|heavy/, 800],
  [/black/, 900],
  [/bold/, 700],
  [/medium/, 500],
  [/regular|normal|book|roman/, 400],
];

/** "Semi Bold Italic" -> { weight: 600, italic: true } */
export function parseFontStyle(style: string | undefined): ParsedFontStyle {
  const s = (style ?? '').toLowerCase().replace(/[\s_-]+/g, '');
  const italic = /italic|oblique/.test(s);
  const stripped = s.replace(/italic|oblique/g, '');
  for (const [re, w] of WEIGHTS) if (re.test(stripped)) return { weight: w, italic };
  return { weight: 400, italic };
}

export function fontStack(family: string | undefined): string {
  const f = (family ?? '').trim();
  const q = f ? `'${f.replace(/'/g, '')}', ` : '';
  const lower = f.toLowerCase();
  if (/mono|code|courier|consolas|menlo/.test(lower))
    return `${q}ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace`;
  if (/serif|georgia|times|garamond|playfair|merriweather|lora/.test(lower) && !/sans/.test(lower))
    return `${q}Georgia, 'Times New Roman', Times, serif`;
  return `${q}system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif`;
}

/** Best-effort PostScript name ("Inter" + "Semi Bold" -> "Inter-SemiBold"). */
export function psFontName(family: string, style: string): string {
  const fam = family.replace(/\s+/g, '');
  const sty = style.replace(/\s+/g, '');
  return !sty || sty === 'Regular' ? `${fam}-Regular` : `${fam}-${sty}`;
}
