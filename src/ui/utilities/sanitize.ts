const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/** "Home / Desktop: Final" -> "Home-Desktop-Final" */
export function sanitizeFileName(name: string, fallback = 'export'): string {
  let s = String(name ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
    .replace(/\s*-\s*/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '');
  if (s.length > 120) s = s.slice(0, 120).replace(/-+$/g, '');
  if (!s) return fallback;
  return RESERVED.test(s) ? `${s}-file` : s;
}

/** Valid, readable XML/HTML id or class token. */
export function sanitizeId(name: string, fallback = 'layer'): string {
  const s = String(name ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
  const out = s || fallback;
  return /^[a-z_]/.test(out) ? out : `n-${out}`;
}

export function uniqueName(base: string, used: Set<string>, sep = '-'): string {
  let name = base;
  let i = 2;
  while (used.has(name)) name = `${base}${sep}${i++}`;
  used.add(name);
  return name;
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function escapeXml(s: string): string {
  return escapeHtml(s).replace(/'/g, '&apos;');
}

/** "Image/Hero_banner" -> "Hero banner" */
export function humanize(name: string): string {
  const last = String(name).split('/').pop() ?? '';
  return last.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export interface FileNameVars {
  name: string;
  width: number;
  height: number;
  page?: string;
  scale?: number;
  index?: number;
}

export function applyFileNamePattern(pattern: string, vars: FileNameVars): string {
  const p = pattern && pattern.trim() ? pattern : '{name}';
  const out = p
    .replace(/\{name\}/g, vars.name)
    .replace(/\{width\}/g, String(Math.round(vars.width)))
    .replace(/\{height\}/g, String(Math.round(vars.height)))
    .replace(/\{page\}/g, vars.page ?? '')
    .replace(/\{scale\}/g, `${vars.scale ?? 1}x`)
    .replace(/\{index\}/g, String((vars.index ?? 0) + 1));
  return sanitizeFileName(out);
}
