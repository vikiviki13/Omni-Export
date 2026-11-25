import type { Rgba } from '../../shared/color';
export * from '../../shared/color';

export const toPsdColor = (c: Rgba) => ({ r: c.r, g: c.g, b: c.b });
