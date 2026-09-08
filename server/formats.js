export const SUPPORTED_EXTENSIONS = new Set(['pdf', 'jpg', 'jpeg', 'png', 'webp', 'gif', 'cbz', 'cbr']);
export const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif']);

export function extension(name = '') {
  const match = String(name).toLowerCase().match(/\.([a-z0-9]+)$/i);
  return match?.[1] || '';
}

export function formatForName(name = '') {
  const ext = extension(name);
  if (ext === 'pdf') return 'pdf';
  if (ext === 'cbz') return 'cbz';
  if (ext === 'cbr') return 'cbr';
  if (IMAGE_EXTENSIONS.has(ext)) return 'image';
  return ext || 'unknown';
}

export function mimeForName(name = '') {
  const ext = extension(name);
  if (ext === 'pdf') return 'application/pdf';
  if (ext === 'cbz') return 'application/vnd.comicbook+zip';
  if (ext === 'cbr') return 'application/vnd.comicbook-rar';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'gif') return 'image/gif';
  return 'application/octet-stream';
}

export function isSupportedName(name = '') { return SUPPORTED_EXTENSIONS.has(extension(name)); }
export function imageMimeFromName(name = '') { return mimeForName(name); }
