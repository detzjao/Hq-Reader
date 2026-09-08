const ENV_API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
const STORAGE_KEY = 'hq-reader:api-base-url';

function normalizeBase(value = '') {
  return String(value || '').trim().replace(/\/$/, '');
}

export function getStoredApiBaseUrl() {
  try {
    return normalizeBase(localStorage.getItem(STORAGE_KEY) || '');
  } catch {
    return '';
  }
}

export function getApiBaseUrl() {
  return getStoredApiBaseUrl() || ENV_API_BASE || '';
}

export function getConfiguredApiBaseUrl() {
  return getStoredApiBaseUrl() || ENV_API_BASE || '';
}

export function setApiBaseUrl(value) {
  const normalized = normalizeBase(value);
  try {
    if (normalized) localStorage.setItem(STORAGE_KEY, normalized);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignora indisponibilidade do localStorage.
  }
  return normalized;
}

export function getBuildApiBaseUrl() {
  return ENV_API_BASE;
}

export class ApiError extends Error {
  constructor(message, { status = 0, code = 'NETWORK_ERROR' } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

async function parseErrorResponse(response) {
  let body = {};
  try { body = await response.json(); } catch { body = {}; }

  if (!body?.error && response.status === 404 && !getApiBaseUrl() && typeof window !== 'undefined' && window.location.hostname !== 'localhost') {
    return new ApiError('O backend da biblioteca não está configurado para esta publicação.', {
      status: 404,
      code: 'API_NOT_CONFIGURED'
    });
  }

  return new ApiError(body.error || `Erro HTTP ${response.status}.`, {
    status: response.status,
    code: body.code || 'HTTP_ERROR'
  });
}

async function request(path, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeout ?? 20_000);
  const API_BASE = getApiBaseUrl();
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      signal: options.signal || controller.signal,
      headers: {
        Accept: 'application/json',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {})
      }
    });
    if (!response.ok) throw await parseErrorResponse(response);
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      throw new ApiError('A resposta recebida não veio do backend do HQ Reader. Configure o endereço do servidor.', {
        status: response.status,
        code: 'INVALID_API_RESPONSE'
      });
    }
    return response.json();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error.name === 'AbortError') throw new ApiError('A solicitação demorou demais. Tente novamente.', { code: 'TIMEOUT' });
    throw new ApiError('Não foi possível conectar ao servidor do HQ Reader.', { code: 'NETWORK_ERROR' });
  } finally {
    clearTimeout(timeout);
  }
}

async function uploadComic(file, collectionPath = '') {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30 * 60_000);
  const API_BASE = getApiBaseUrl();
  try {
    const response = await fetch(`${API_BASE}/api/library/upload`, {
      method: 'POST',
      body: file,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'Content-Type': file.type || 'application/octet-stream',
        'X-File-Name': encodeURIComponent(file.name),
        'X-Collection-Path': encodeURIComponent(collectionPath || '')
      }
    });
    if (!response.ok) throw await parseErrorResponse(response);
    return response.json();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error.name === 'AbortError') throw new ApiError('O envio demorou demais e foi interrompido.', { code: 'UPLOAD_TIMEOUT' });
    throw new ApiError('Não foi possível enviar a HQ para o servidor.', { code: 'UPLOAD_FAILED' });
  } finally {
    clearTimeout(timeout);
  }
}

export const api = {
  health: () => request('/api/health'),
  getComics: () => request('/api/comics'),
  getComic: (id) => request(`/api/comics/${encodeURIComponent(id)}`),
  getComicPages: (id) => request(`/api/comics/${encodeURIComponent(id)}/pages`, { timeout: 60_000 }),
  getLibraryStatus: () => request('/api/library'),
  syncLibrarySources: (force = false) => request('/api/library/sync', {
    method: 'POST',
    body: JSON.stringify({ force }),
    timeout: 15 * 60_000
  }),
  addToLibrary: ({ url, name, path }) => request('/api/library', {
    method: 'POST',
    body: JSON.stringify({ url, name, path })
  }),
  uploadToLibrary: (file, path) => uploadComic(file, path),
  importLibrary: (text) => request('/api/library/import', {
    method: 'POST',
    body: JSON.stringify({ text }),
    timeout: 120_000
  }),
  removeFromLibrary: (id) => request(`/api/library/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  assetUrl: (path) => `${getApiBaseUrl()}${path}`,
  downloadUrl: (id) => `${getApiBaseUrl()}/api/comics/${encodeURIComponent(id)}/download`
};
