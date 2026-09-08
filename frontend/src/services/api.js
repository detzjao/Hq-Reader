const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

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
  return new ApiError(body.error || `Erro HTTP ${response.status}.`, {
    status: response.status,
    code: body.code || 'HTTP_ERROR'
  });
}

async function request(path, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeout ?? 20_000);
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
  assetUrl: (path) => `${API_BASE}${path}`,
  downloadUrl: (id) => `${API_BASE}/api/comics/${encodeURIComponent(id)}/download`
};
