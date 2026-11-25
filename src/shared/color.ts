export interface Rgba {
  r: number; // 0-255
  g: number;
  b: number;
  a: number; // 0-1
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const to255 = (v: number) => Math.round(clamp(v, 0, 1) * 255);
export const round = (v: number, d = 2) => {
  const f = Math.pow(10, d);
  return Math.round(v * f) / f;
};

/** Figma colours are 0-1 floats; convert to 0-255 RGB plus 0-1 alpha. */
export function figmaToRgba(c: { r: number; g: number; b: number; a?: number }, opacity = 1): Rgba {
  return {
    r: to255(c.r),
    g: to255(c.g),
    b: to255(c.b),
    a: round(clamp((c.a ?? 1) * opacity, 0, 1), 4),
  };
}

const hex2 = (n: number) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0');

export function rgbaToHex(c: Rgba, withAlpha = false): string {
  const base = `#${hex2(c.r)}${hex2(c.g)}${hex2(c.b)}`;
  return withAlpha && c.a < 1 ? base + hex2(c.a * 255) : base;
}

export function rgbaToCss(c: Rgba): string {
  if (c.a >= 1) return rgbaToHex(c);
  return `rgba(${c.r}, ${c.g}, ${c.b}, ${round(c.a, 3)})`;
}

export function hexToRgba(hex: string): Rgba | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3)
    h = h
      .split('')
      .map((x) => x + x)
      .join('');
  const n = (i: number) => parseInt(h.slice(i, i + 2), 16);
  return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? round(n(6) / 255, 4) : 1 };
}
