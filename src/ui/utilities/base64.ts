export function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
  }
  return btoa(bin);
}

export function toDataUrl(bytes: Uint8Array, mime: string): string {
  return `data:${mime};base64,${bytesToBase64(bytes)}`;
}

export function extForMime(mime: string): string {
  return mime === 'image/jpeg'
    ? 'jpg'
    : mime === 'image/gif'
      ? 'gif'
      : mime === 'image/webp'
        ? 'webp'
        : 'png';
}

export function utf8(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}
