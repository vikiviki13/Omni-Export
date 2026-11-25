import type { ImageAsset } from '../shared/types';

const cache = new Map<string, ImageAsset | null>();

export function sniffMime(b: Uint8Array): string {
  if (b[0] === 0x89 && b[1] === 0x50) return 'image/png';
  if (b[0] === 0xff && b[1] === 0xd8) return 'image/jpeg';
  if (b[0] === 0x47 && b[1] === 0x49) return 'image/gif';
  if (b[0] === 0x52 && b[1] === 0x49 && b[8] === 0x57) return 'image/webp';
  return 'image/png';
}

export async function readImage(hash: string): Promise<ImageAsset | null> {
  if (cache.has(hash)) return cache.get(hash) ?? null;
  let result: ImageAsset | null = null;
  try {
    const img = figma.getImageByHash(hash);
    if (img) {
      const bytes = await img.getBytesAsync();
      result = { bytes, mime: sniffMime(bytes) };
    }
  } catch {
    result = null;
  }
  cache.set(hash, result);
  return result;
}

export function clearImageCache(): void {
  cache.clear();
}
