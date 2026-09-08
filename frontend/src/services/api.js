import { upload } from '@vercel/blob/client';

const ADMIN_STORAGE_KEY = 'hq-reader:admin-token';
const DISCOVERED_STORAGE_KEY = 'hq-reader:drive-sync-files';

export class ApiError extends Error {
  constructor(message, { status = 0, code = 'NETWORK_ERROR' } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export function getAdminToken() {
  try { return localStorage.getItem(ADMIN_STORAGE_KEY) || ''; } catch { return ''; }
}

export function setAdminToken(value) {
  const clean = String(value || '').trim();
  try {
    if (clean) localStorage.setItem(ADMIN_STORAGE_KEY, clean);
    else localStorage.removeItem(ADMIN_STORAGE_KEY);
  } catch {}
  return clean;
}

function getDiscoveredComics() {
  try {
    const parsed = JSON.parse(localStorage.getItem(DISCOVERED_STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter((item) => item?.id && item?.name) : [];
  } catch { return []; }
}

function saveDiscoveredComics(files) {
  const unique = [...new Map((files || []).filter((item) => item?.id && item?.name).map((item) => [item.id, item])).values()];
  try { localStorage.setItem(DISCOVERED_STORAGE_KEY, JSON.stringify(unique)); } catch {}
  return unique;
}

function findDiscoveredComic(id) {
  return getDiscoveredComics().find((item) => item.id === id) || null;
}

function mergeComics(serverFiles = []) {
  const byId = new Map((serverFiles || []).map((item) => [item.id, item]));
  for (const comic of getDiscoveredComics()) {
    if (!byId.has(comic.id)) byId.set(comic.id, comic);
  }
  return [...byId.values()];
}

async function parseError(response) {
  let body = {};
  try { body = await response.json(); } catch {}
  return new ApiError(body.error || `Erro HTTP ${response.status}.`, { status: response.status, code: body.code || 'HTTP_ERROR' });
}

async function request(path, { admin = false, timeout = 30_000, ...options } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(path, {
      ...options,
      signal: options.signal || controller.signal,
      headers: {
        Accept: 'application/json',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(admin && getAdminToken() ? { 'X-Admin-Token': getAdminToken() } : {}),
        ...(options.headers || {})
      }
    });
    if (!response.ok) throw await parseError(response);
    return response.json();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error?.name === 'AbortError') throw new ApiError('A solicitação demorou demais. Tente novamente.', { code: 'TIMEOUT' });
    throw new ApiError('Não foi possível concluir a solicitação.', { code: 'NETWORK_ERROR' });
  } finally { clearTimeout(timer); }
}

export async function uploadBlobFile(file, { onProgress } = {}) {
  const adminToken = getAdminToken();
  if (!adminToken) throw new ApiError('Informe a senha de administração antes de enviar arquivos.', { code: 'ADMIN_TOKEN_REQUIRED', status: 401 });
  try {
    return await upload(`hq-reader/uploads/${Date.now()}-${file.name}`, file, {
      access: 'public',
      handleUploadUrl: '/api/blob-upload',
      multipart: file.size > 20 * 1024 * 1024,
      clientPayload: JSON.stringify({ adminToken }),
      onUploadProgress: onProgress
    });
  } catch (error) {
    throw new ApiError(error?.message || 'Não foi possível enviar o arquivo.', { code: 'UPLOAD_FAILED' });
  }
}

export async function uploadThumbnailBlob(blob, filename) {
  const adminToken = getAdminToken();
  if (!adminToken) return null;
  try {
    return await upload(`hq-reader/covers/${Date.now()}-${filename}`, blob, {
      access: 'public',
      handleUploadUrl: '/api/blob-upload',
      clientPayload: JSON.stringify({ adminToken })
    });
  } catch { return null; }
}

async function getComics(fresh = false) {
  const response = await request(`/api/comics${fresh ? `?fresh=${Date.now()}` : ''}`);
  return { ...response, files: mergeComics(response.files || []) };
}

async function getComic(id) {
  const discovered = findDiscoveredComic(id);
  if (discovered) return { comic: discovered };
  return request(`/api/comic?id=${encodeURIComponent(id)}`);
}

async function syncLibrarySources() {
  const result = await request('/api/library', { method: 'POST', admin: true, timeout: 290_000 });
  if (Array.isArray(result.files)) saveDiscoveredComics(result.files);
  return result;
}

function directParams(comic) {
  if (!comic?.discoveredBySync) return '';
  const params = new URLSearchParams({ direct: '1' });
  if (comic.resourceKey) params.set('resourceKey', comic.resourceKey);
  return `&${params.toString()}`;
}

export const api = {
  health: () => request('/api/health'),
  getComics,
  getComic,
  syncLibrarySources,
  getArchivePages: (id) => {
    const comic = findDiscoveredComic(id);
    const extra = comic ? `${directParams(comic)}&name=${encodeURIComponent(comic.name)}` : '';
    return request(`/api/archive?id=${encodeURIComponent(id)}${extra}`, { timeout: 120_000 });
  },
  getLibraryStatus: () => request('/api/library'),
  addToLibrary: ({ url, name, path }) => request('/api/library-add', { method: 'POST', admin: true, body: JSON.stringify({ url, name, path }) }),
  importLibrary: (text) => request('/api/library-import', { method: 'POST', admin: true, body: JSON.stringify({ text }), timeout: 60_000 }),
  registerUpload: ({ blob, originalName, size, path, thumbnailUrl }) => request('/api/library-upload-meta', { method: 'POST', admin: true, body: JSON.stringify({ blob, originalName, size, path, thumbnailUrl }) }),
  removeFromLibrary: (id) => request(`/api/library-delete?id=${encodeURIComponent(id)}`, { method: 'DELETE', admin: true }),
  assetUrl: (value = '') => /^https?:\/\//i.test(value) ? value : value,
  downloadUrl: (id) => {
    const comic = findDiscoveredComic(id);
    return `/api/download?id=${encodeURIComponent(id)}${comic ? directParams(comic) : ''}`;
  }
};
