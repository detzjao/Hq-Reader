import { upload } from '@vercel/blob/client';

const ADMIN_STORAGE_KEY = 'hq-reader:admin-token';
const DISCOVERED_STORAGE_KEY = 'hq-reader:drive-sync-files';
const CUSTOM_SOURCES_STORAGE_KEY = 'hq-reader:custom-drive-sources';

const MARVEL_EXTRA_PARENT_ID = '1wE5ePfzZkIHa-RADBEpkB_FWAJowI2K6';
const MARVEL_DRIVE_SOURCE_ID = '1wXs64lZ0nOBAAWwGutDHfjO-TnfYO6Ee';
const MARVEL_INDIVIDUAL_SOURCE_ID = '1s4EOXNu4ryLbPJwiofmhQKNa8HmVMZpC';

function splitLegacyMarvelExtraSource(sourceById) {
  const legacy = sourceById.get(MARVEL_EXTRA_PARENT_ID);
  if (!legacy) return;

  // Uma única execução para a pasta-pai era grande demais e dependia da
  // listagem parcial do Google. Divide a coleção nas duas raízes reais para
  // cada uma receber sua própria janela de sincronização.
  sourceById.delete(MARVEL_EXTRA_PARENT_ID);
  if (!sourceById.has(MARVEL_DRIVE_SOURCE_ID)) {
    sourceById.set(MARVEL_DRIVE_SOURCE_ID, {
      id: MARVEL_DRIVE_SOURCE_ID,
      label: 'Marvel Drive',
      category: legacy.category || 'Marvel',
      path: 'Marvel/MARVEL DRIVE',
      url: `https://drive.google.com/drive/folders/${MARVEL_DRIVE_SOURCE_ID}`,
      enabled: true
    });
  }
  if (!sourceById.has(MARVEL_INDIVIDUAL_SOURCE_ID)) {
    sourceById.set(MARVEL_INDIVIDUAL_SOURCE_ID, {
      id: MARVEL_INDIVIDUAL_SOURCE_ID,
      label: 'Marvel Individual',
      category: legacy.category || 'Marvel',
      path: 'Marvel/MARVEL INDIVIDUAL',
      url: `https://drive.google.com/drive/folders/${MARVEL_INDIVIDUAL_SOURCE_ID}`,
      enabled: true
    });
  }
}

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

function saveDiscoveredComics(files, { replace = false } = {}) {
  const byId = new Map();
  if (!replace) for (const item of getDiscoveredComics()) byId.set(item.id, item);
  for (const item of files || []) if (item?.id && item?.name) byId.set(item.id, item);
  const unique = [...byId.values()];
  try { localStorage.setItem(DISCOVERED_STORAGE_KEY, JSON.stringify(unique)); } catch {}
  return unique;
}

function getCustomSources() {
  try {
    const parsed = JSON.parse(localStorage.getItem(CUSTOM_SOURCES_STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter((item) => item?.id && item?.url) : [];
  } catch { return []; }
}

function saveCustomSource(source) {
  if (!source?.id || !source?.url) return getCustomSources();
  const byId = new Map(getCustomSources().map((item) => [item.id, item]));
  byId.set(source.id, source);
  const sources = [...byId.values()];
  try { localStorage.setItem(CUSTOM_SOURCES_STORAGE_KEY, JSON.stringify(sources)); } catch {}
  return sources;
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

async function syncLibrarySources({ onProgress } = {}) {
  const customSources = getCustomSources();
  let status = { sources: [] };
  try { status = await request('/api/library', { timeout: 30_000 }); } catch {}

  const sourceById = new Map();
  for (const source of status.sources || []) if (source?.id) sourceById.set(source.id, source);
  for (const source of customSources) if (source?.id) sourceById.set(source.id, source);
  splitLegacyMarvelExtraSource(sourceById);
  const sources = [...sourceById.values()];

  // Cada Drive recebe sua própria janela de execução. Isso evita que uma coleção
  // muito grande consuma o tempo das demais e permite salvar o que já foi encontrado.
  if (!sources.length) {
    const result = await request('/api/library', {
      method: 'POST',
      timeout: 290_000,
      body: JSON.stringify({ action: 'sync', sources: customSources })
    });
    if (Array.isArray(result.files)) saveDiscoveredComics(result.files);
    return result;
  }

  const allFiles = new Map();
  const summaries = [];
  let added = 0;
  let total = 0;
  let persisted = false;

  for (let index = 0; index < sources.length; index += 1) {
    const source = sources[index];
    try {
      const result = await request('/api/library', {
        method: 'POST',
        timeout: 290_000,
        body: JSON.stringify({ action: 'sync', sources: customSources, sourceIds: [source.id] })
      });
      for (const file of result.files || []) if (file?.id) allFiles.set(file.id, file);
      if (Array.isArray(result.files)) saveDiscoveredComics(result.files);
      summaries.push(...(result.sources || []));
      added += Number(result.added || 0);
      total = Math.max(total, Number(result.total || 0));
      persisted = persisted || Boolean(result.persisted);
      if (onProgress) await onProgress({ source, index, totalSources: sources.length, result });
    } catch (error) {
      summaries.push({ id: source.id, label: source.label, category: source.category, ok: false, error: error.message || 'Falha na varredura.' });
      if (onProgress) await onProgress({ source, index, totalSources: sources.length, error });
    }
  }

  const successful = summaries.filter((item) => item.ok).length;
  return {
    ok: successful > 0,
    partial: successful < summaries.length,
    sources: summaries,
    files: [...allFiles.values()],
    found: allFiles.size,
    added,
    total,
    persisted
  };
}

async function addToLibrary({ url, name, path }) {
  const result = await request('/api/library-add', {
    method: 'POST',
    admin: true,
    timeout: 290_000,
    body: JSON.stringify({ url, name, path })
  });
  if (result?.type === 'folder') {
    if (result.source) saveCustomSource(result.source);
    if (Array.isArray(result.sync?.files)) saveDiscoveredComics(result.sync.files);
  }
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
  addToLibrary,
  importLibrary: (text) => request('/api/library-import', { method: 'POST', admin: true, body: JSON.stringify({ text }), timeout: 60_000 }),
  registerUpload: ({ blob, originalName, size, path, thumbnailUrl }) => request('/api/library-upload-meta', { method: 'POST', admin: true, body: JSON.stringify({ blob, originalName, size, path, thumbnailUrl }) }),
  removeFromLibrary: (id) => request(`/api/library-delete?id=${encodeURIComponent(id)}`, { method: 'DELETE', admin: true }),
  assetUrl: (value = '') => /^https?:\/\//i.test(value) ? value : value,
  downloadUrl: (id) => {
    const comic = findDiscoveredComic(id);
    return `/api/download?id=${encodeURIComponent(id)}${comic ? directParams(comic) : ''}`;
  }
};
