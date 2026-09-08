const PUBLIC_DOWNLOAD_BASE = 'https://drive.usercontent.google.com/download';
const PUBLIC_FALLBACK_BASE = 'https://drive.google.com/uc';
const PUBLIC_THUMBNAIL_BASE = 'https://drive.google.com/thumbnail';

export class DriveAccessError extends Error {
  constructor(message, { code = 'DRIVE_ERROR', status = 502, cause } = {}) {
    super(message, { cause });
    this.name = 'DriveAccessError';
    this.code = code;
    this.status = status;
  }
}

function rawId(value = '') { return /^[A-Za-z0-9_-]{20,}$/.test(String(value)) ? String(value) : ''; }

export function parseGoogleDriveLink(input) {
  const value = String(input || '').trim();
  if (!value) throw new DriveAccessError('Informe um link público do Google Drive.', { code: 'INVALID_DRIVE_LINK', status: 400 });
  const directId = rawId(value);
  if (directId) return { id: directId, resourceKey: '', sourceUrl: value };
  let url;
  try { url = new URL(value); } catch { throw new DriveAccessError('O link informado não é uma URL válida.', { code: 'INVALID_DRIVE_LINK', status: 400 }); }
  if (!['drive.google.com', 'drive.usercontent.google.com', 'docs.google.com'].includes(url.hostname.toLowerCase())) {
    throw new DriveAccessError('O link precisa apontar para um arquivo do Google Drive.', { code: 'INVALID_DRIVE_LINK', status: 400 });
  }
  if (/\/folders\//i.test(url.pathname)) {
    throw new DriveAccessError('Para adicionar uma HQ, use o link público do arquivo individual.', { code: 'DRIVE_FOLDER_LINK_UNSUPPORTED', status: 400 });
  }
  const id = url.pathname.match(/\/d\/([A-Za-z0-9_-]{20,})/)?.[1] || rawId(url.searchParams.get('id') || '');
  if (!id) throw new DriveAccessError('Não foi possível identificar o ID do arquivo nesse link.', { code: 'INVALID_DRIVE_LINK', status: 400 });
  return { id, resourceKey: url.searchParams.get('resourcekey') || url.searchParams.get('resourceKey') || '', sourceUrl: value };
}

function candidates(fileId, resourceKey = '') {
  const params = new URLSearchParams({ id: fileId, export: 'download', confirm: 't' });
  if (resourceKey) params.set('resourcekey', resourceKey);
  return [`${PUBLIC_DOWNLOAD_BASE}?${params}`, `${PUBLIC_FALLBACK_BASE}?${params}`];
}

function looksLikeHtml(response) { return (response.headers.get('content-type') || '').toLowerCase().includes('text/html'); }
async function cancel(response) { try { await response.body?.cancel(); } catch {} }

export async function fetchPublicFile(fileId, { resourceKey = '', range = '', timeout = 45_000 } = {}) {
  let lastStatus = 0;
  for (const url of candidates(fileId, resourceKey)) {
    let response;
    try {
      response = await fetch(url, {
        redirect: 'follow',
        headers: { 'User-Agent': 'HQ-Reader-Vercel/2.0', Accept: '*/*', ...(range ? { Range: range } : {}) },
        signal: AbortSignal.timeout(timeout)
      });
    } catch { continue; }
    lastStatus = response.status;
    if (response.ok && !looksLikeHtml(response)) return response;
    await cancel(response);
  }
  const error = new DriveAccessError(
    lastStatus === 403 ? 'O Google Drive recusou o download deste arquivo.' : lastStatus === 404 ? 'Arquivo não encontrado no Google Drive.' : 'O Google Drive não entregou o arquivo público.',
    { code: lastStatus === 403 ? 'DRIVE_DOWNLOAD_RESTRICTED' : lastStatus === 404 ? 'DRIVE_NOT_FOUND' : 'DRIVE_PUBLIC_DOWNLOAD_FAILED', status: lastStatus === 403 || lastStatus === 404 ? lastStatus : 502 }
  );
  throw error;
}

function filenameFromDisposition(value = '') {
  const utf = value.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (utf) { try { return decodeURIComponent(utf.replace(/^"|"$/g, '')); } catch {} }
  return value.match(/filename="([^"]+)"/i)?.[1] || value.match(/filename=([^;]+)/i)?.[1]?.trim() || '';
}

function totalSize(headers) {
  const total = (headers.get('content-range') || '').match(/\/(\d+)$/)?.[1];
  return Number(total || headers.get('content-length') || 0);
}

export async function probePublicFile(input) {
  const parsed = typeof input === 'string' ? parseGoogleDriveLink(input) : input;
  const response = await fetchPublicFile(parsed.id, { resourceKey: parsed.resourceKey, range: 'bytes=0-0', timeout: 20_000 });
  const result = {
    id: parsed.id,
    name: filenameFromDisposition(response.headers.get('content-disposition') || ''),
    mimeType: (response.headers.get('content-type') || 'application/octet-stream').split(';')[0],
    size: totalSize(response.headers),
    sourceUrl: parsed.sourceUrl || '',
    resourceKey: parsed.resourceKey || ''
  };
  await cancel(response);
  return result;
}

export function driveThumbnailUrl(file, width = 500) {
  const url = new URL(PUBLIC_THUMBNAIL_BASE);
  url.searchParams.set('id', file.id);
  url.searchParams.set('sz', `w${Math.max(120, Math.min(1200, Number(width) || 500))}`);
  if (file.resourceKey) url.searchParams.set('resourcekey', file.resourceKey);
  return url.toString();
}

export function driveDownloadUrl(file) {
  const params = new URLSearchParams({ id: file.id, export: 'download', confirm: 't' });
  if (file.resourceKey) params.set('resourcekey', file.resourceKey);
  return `${PUBLIC_DOWNLOAD_BASE}?${params}`;
}
