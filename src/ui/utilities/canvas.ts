import { CANVAS_MAX_PIXELS } from '../../shared/constants';

export function validateCanvasSize(w: number, h: number): string | null {
  if (!(w > 0 && h > 0)) return 'empty canvas';
  if (w > 32000 || h > 32000) return `canvas ${w}×${h}px is too large`;
  if (w * h > CANVAS_MAX_PIXELS) return `canvas ${w}×${h}px exceeds the memory limit`;
  return null;
}

export function createCanvas(w: number, h: number): HTMLCanvasElement {
  const err = validateCanvasSize(w, h);
  if (err) throw new Error(err);
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

export async function bytesToCanvas(
  bytes: Uint8Array,
  mime = 'image/png',
): Promise<HTMLCanvasElement> {
  const blob = new Blob([bytes as BlobPart], { type: mime });
  const bmp = await createImageBitmap(blob);
  try {
    const c = createCanvas(bmp.width, bmp.height);
    c.getContext('2d')!.drawImage(bmp, 0, 0);
    return c;
  } finally {
    bmp.close();
  }
}

export function cropCanvas(
  src: HTMLCanvasElement,
  x: number,
  y: number,
  w: number,
  h: number,
): HTMLCanvasElement {
  const c = createCanvas(w, h);
  c.getContext('2d')!.drawImage(src, x, y, w, h, 0, 0, w, h);
  return c;
}

export async function canvasToPngBytes(c: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/png'));
  if (!blob) throw new Error('Canvas could not be encoded');
  return new Uint8Array(await blob.arrayBuffer());
}

export function releaseCanvas(c: HTMLCanvasElement | undefined): void {
  if (!c) return;
  c.width = 0;
  c.height = 0;
}
