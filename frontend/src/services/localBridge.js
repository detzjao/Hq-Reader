const URL_KEY = 'hq-reader:local-bridge-url';
const TOKEN_KEY = 'hq-reader:local-bridge-token';

export function getLocalBridgeConfig() {
  try {
    return {
      url: (localStorage.getItem(URL_KEY) || 'http://127.0.0.1:8787').replace(/\/+$/, ''),
      token: localStorage.getItem(TOKEN_KEY) || ''
    };
  } catch {
    return { url: 'http://127.0.0.1:8787', token: '' };
  }
}

export function saveLocalBridgeConfig({ url, token }) {
  const cleanUrl = String(url || 'http://127.0.0.1:8787').trim().replace(/\/+$/, '');
  const cleanToken = String(token || '').trim();
  localStorage.setItem(URL_KEY, cleanUrl);
  localStorage.setItem(TOKEN_KEY, cleanToken);
  window.dispatchEvent(new CustomEvent('hq-reader:local-bridge-config'));
  return { url: cleanUrl, token: cleanToken };
}

export function isLocalComicId(id) {
  return /^local:\d+:\d+$/.test(String(id || ''));
}

export function parseLocalComicId(id) {
  const match = String(id || '').match(/^local:(\d+):(\d+)$/);
  if (!match) throw new Error('Identificador local inválido.');
  return { chatId: Number(match[1]), messageId: Number(match[2]) };
}

function configOrThrow() {
  const config = getLocalBridgeConfig();
  if (!config.token) throw new Error('Configure o token do Worker local antes de acessar a biblioteca Telegram.');
  return config;
}

async function request(path, options = {}) {
  const { url, token } = configOrThrow();
  const response = await fetch(`${url}${path}`, {
    ...options,
    headers: {
      Accept: 'application/json',
      'X-HQ-Token': token,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {})
    }
  });
  if (!response.ok) {
    let message = `Erro ${response.status}`;
    try {
      const body = await response.json();
      message = body.detail || body.error || message;
    } catch {}
    throw new Error(message);
  }
  if (response.status === 204) return null;
  return response.json();
}

export function localAssetUrl(path) {
  if (!path) return '';
  const { url, token } = configOrThrow();
  const absolute = /^https?:\/\//i.test(path) ? path : `${url}${path}`;
  const glue = absolute.includes('?') ? '&' : '?';
  return `${absolute}${glue}token=${encodeURIComponent(token)}`;
}

export const localBridge = {
  getConfig: getLocalBridgeConfig,
  saveConfig: saveLocalBridgeConfig,
  test: () => request('/api/health'),
  health: () => request('/api/health'),
  catalog: ({ q = '', status = 'all', extension = 'all', page = 1, pageSize = 48 } = {}) => {
    const params = new URLSearchParams({ q, status, extension, page: String(page), pageSize: String(pageSize) });
    return request(`/api/catalog?${params}`);
  },
  getComic: async (id) => {
    const { chatId, messageId } = parseLocalComicId(id);
    const data = await request(`/api/comic/${chatId}/${messageId}`);
    return data.comic;
  },
  queueDownload: async (id) => {
    const { chatId, messageId } = parseLocalComicId(id);
    return request(`/api/download/${chatId}/${messageId}`, { method: 'POST' });
  },
  cancelDownload: async (id) => {
    const { chatId, messageId } = parseLocalComicId(id);
    return request(`/api/download/${chatId}/${messageId}`, { method: 'DELETE' });
  },
  deleteLocal: async (id) => {
    const { chatId, messageId } = parseLocalComicId(id);
    return request(`/api/file/${chatId}/${messageId}`, { method: 'DELETE' });
  },
  setPinned: async (id, pinned) => {
    const { chatId, messageId } = parseLocalComicId(id);
    return request(`/api/pin/${chatId}/${messageId}`, { method: 'POST', body: JSON.stringify({ pinned }) });
  },
  fileUrl: (id) => {
    const { chatId, messageId } = parseLocalComicId(id);
    return localAssetUrl(`/api/file/${chatId}/${messageId}`);
  },
  coverUrl: (id) => {
    const { chatId, messageId } = parseLocalComicId(id);
    return localAssetUrl(`/api/cover/${chatId}/${messageId}`);
  },
  archive: async (id) => {
    const { chatId, messageId } = parseLocalComicId(id);
    const data = await request(`/api/archive/${chatId}/${messageId}`);
    return {
      ...data,
      pages: (data.pages || []).map((page) => ({ ...page, url: localAssetUrl(page.url) }))
    };
  }
};
