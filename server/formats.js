export const SUPPORTED_EXTENSIONS = new Set(['pdf', 'jpg', 'jpeg', 'png', 'webp', 'gif', 'cbz', 'cbr']);
export const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif']);

const MIME_TO_EXTENSION = new Map([
  ['application/pdf', 'pdf'],
  ['image/jpeg', 'jpg'],
  ['image/jpg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
  ['image/gif', 'gif'],
  ['application/vnd.comicbook+zip', 'cbz'],
  ['application/x-cbz', 'cbz'],
  ['application/zip', 'cbz'],
  ['application/x-zip-compressed', 'cbz'],
  ['application/vnd.comicbook-rar', 'cbr'],
  ['application/x-cbr', 'cbr'],
  ['application/vnd.rar', 'cbr'],
  ['application/x-rar-compressed', 'cbr']
]);

export function extension(name = '') {
  const match = String(name).toLowerCase().match(/\.([a-z0-9]+)$/i);
  return match?.[1] || '';
}

export function extensionForMime(mimeType = '') {
  return MIME_TO_EXTENSION.get(String(mimeType || '').toLowerCase().split(';')[0].trim()) || '';
}

export function formatForName(name = '') {
  const ext = extension(name);
  if (ext === 'pdf') return 'pdf';
  if (ext === 'cbz') return 'cbz';
  if (ext === 'cbr') return 'cbr';
  if (IMAGE_EXTENSIONS.has(ext)) return 'image';
  return ext || 'unknown';
}

export function formatForFile(name = '', mimeType = '') {
  const byName = formatForName(name);
  if (byName !== 'unknown') return byName;
  const inferred = extensionForMime(mimeType);
  if (inferred === 'pdf') return 'pdf';
  if (inferred === 'cbz') return 'cbz';
  if (inferred === 'cbr') return 'cbr';
  if (IMAGE_EXTENSIONS.has(inferred)) return 'image';
  return 'unknown';
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

export function ensureSupportedExtension(name = '', mimeType = '', fallbackBase = 'HQ') {
  const clean = String(name || '').trim() || String(fallbackBase || 'HQ').trim() || 'HQ';
  if (SUPPORTED_EXTENSIONS.has(extension(clean))) return clean;
  const inferred = extensionForMime(mimeType);
  return inferred ? `${clean}.${inferred}` : clean;
}

export function isSupportedName(name = '') { return SUPPORTED_EXTENSIONS.has(extension(name)); }
export function isSupportedFile(name = '', mimeType = '') {
  return isSupportedName(name) || Boolean(extensionForMime(mimeType));
}
export function imageMimeFromName(name = '') { return mimeForName(name); }
