import { get, list, put } from '@vercel/blob';
import { isBlobConfigured } from './catalog.js';

const STATE_PATH = 'hq-reader/user-state/default.json';
let accessMode = null;
let cache = { at: 0, value: null };

function emptyState() {
  return {
    version: 1,
    updatedAt: null,
    favorites: {},
    reading: {}
  };
}

function cleanTimestamp(value, fallback = null) {
  const time = Date.parse(value || '');
  return Number.isFinite(time) ? new Date(time).toISOString() : fallback;
}

function normalizeFavoriteRecord(id, value = {}) {
  const updatedAt = cleanTimestamp(value.updatedAt, new Date().toISOString());
  return {
    id: String(id),
    favorite: value.favorite !== false,
    updatedAt
  };
}

function normalizeReadingRecord(id, value = {}) {
  const lastPage = Math.max(1, Number(value.lastPage || value.page || 1) || 1);
  const totalPages = Math.max(0, Number(value.totalPages || value.total || 0) || 0);
  const completed = Boolean(value.completed || (totalPages > 0 && lastPage >= totalPages));
  const updatedAt = cleanTimestamp(value.updatedAt, new Date().toISOString());
  return {
    id: String(id),
    started: value.started !== false,
    lastPage,
    totalPages,
    completed,
    startedAt: cleanTimestamp(value.startedAt, updatedAt),
    updatedAt
  };
}

function normalizeState(value = {}) {
  const state = emptyState();
  state.updatedAt = cleanTimestamp(value.updatedAt, null);

  const favoriteEntries = value.favorites && typeof value.favorites === 'object' && !Array.isArray(value.favorites)
    ? Object.entries(value.favorites)
    : [];
  for (const [id, record] of favoriteEntries) {
    if (!id) continue;
    state.favorites[id] = normalizeFavoriteRecord(id, record || {});
  }

  const readingEntries = value.reading && typeof value.reading === 'object' && !Array.isArray(value.reading)
    ? Object.entries(value.reading)
    : [];
  for (const [id, record] of readingEntries) {
    if (!id) continue;
    state.reading[id] = normalizeReadingRecord(id, record || {});
  }
  return state;
}

function publicState(state) {
  const normalized = normalizeState(state);
  const favoriteIds = Object.values(normalized.favorites)
    .filter((record) => record.favorite)
    .map((record) => record.id);
  return {
    version: normalized.version,
    updatedAt: normalized.updatedAt,
    favoriteIds,
    favorites: normalized.favorites,
    reading: normalized.reading,
    persistent: isBlobConfigured()
  };
}

async function readPublicBlob() {
  // SDK recente também permite processar blobs públicos server-side. O bypass de
  // cache evita que um segundo dispositivo veja por até 60s o estado anterior.
  try {
    const direct = await get(STATE_PATH, { access: 'public', useCache: false });
    if (direct?.stream) {
      accessMode = 'public';
      return JSON.parse(await new Response(direct.stream).text());
    }
  } catch {}

  const page = await list({ prefix: STATE_PATH, limit: 20 });
  const blob = (page.blobs || []).find((item) => item.pathname === STATE_PATH);
  if (!blob?.url) return null;
  const separator = blob.url.includes('?') ? '&' : '?';
  const response = await fetch(`${blob.url}${separator}cache=0&t=${Date.now()}`, {
    headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
    signal: AbortSignal.timeout(10_000)
  });
  if (!response.ok) throw new Error(`Falha ao ler estado público (${response.status}).`);
  accessMode = 'public';
  return response.json();
}

async function readPrivateBlob() {
  const result = await get(STATE_PATH, { access: 'private', useCache: false });
  if (!result?.stream) return null;
  const raw = await new Response(result.stream).text();
  accessMode = 'private';
  return JSON.parse(raw);
}

async function readRemoteState() {
  if (!isBlobConfigured()) return emptyState();
  if (accessMode === 'private') {
    try { return normalizeState(await readPrivateBlob() || {}); } catch {}
  }
  if (accessMode === 'public') {
    try { return normalizeState(await readPublicBlob() || {}); } catch {}
  }
  try { return normalizeState(await readPublicBlob() || {}); } catch {}
  try { return normalizeState(await readPrivateBlob() || {}); } catch {}
  return emptyState();
}

async function writeRemoteState(state) {
  if (!isBlobConfigured()) {
    const error = new Error('O armazenamento compartilhado não está conectado.');
    error.code = 'SHARED_STATE_STORAGE_UNAVAILABLE';
    error.status = 503;
    throw error;
  }

  const payload = JSON.stringify({ ...normalizeState(state), updatedAt: new Date().toISOString() });
  const modes = accessMode ? [accessMode] : ['public', 'private'];
  let lastError = null;
  for (const access of modes) {
    try {
      await put(STATE_PATH, payload, {
        access,
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: 'application/json',
        cacheControlMaxAge: 60
      });
      accessMode = access;
      const saved = normalizeState(JSON.parse(payload));
      cache = { at: Date.now(), value: saved };
      return saved;
    } catch (error) {
      lastError = error;
      if (accessMode) break;
    }
  }
  throw lastError || new Error('Não foi possível salvar o estado compartilhado.');
}

function isNewer(next, previous) {
  const nextTime = Date.parse(next?.updatedAt || 0) || 0;
  const previousTime = Date.parse(previous?.updatedAt || 0) || 0;
  return !previous || nextTime >= previousTime;
}

export async function getSharedUserState({ force = false } = {}) {
  if (!isBlobConfigured()) return publicState(emptyState());
  if (!force && cache.value && Date.now() - cache.at < 2_000) return publicState(cache.value);
  const state = await readRemoteState();
  cache = { at: Date.now(), value: state };
  return publicState(state);
}

export async function mergeSharedUserState({ favorites = [], reading = [] } = {}) {
  const current = await readRemoteState();

  for (const value of Array.isArray(favorites) ? favorites.slice(0, 10_000) : []) {
    const id = String(value?.id || '').trim();
    if (!id) continue;
    const next = normalizeFavoriteRecord(id, value);
    if (isNewer(next, current.favorites[id])) current.favorites[id] = next;
  }

  for (const value of Array.isArray(reading) ? reading.slice(0, 10_000) : []) {
    const id = String(value?.id || '').trim();
    if (!id) continue;
    const next = normalizeReadingRecord(id, value);
    if (isNewer(next, current.reading[id])) current.reading[id] = next;
  }

  return publicState(await writeRemoteState(current));
}

export async function setSharedFavorite({ id, favorite, updatedAt } = {}) {
  const key = String(id || '').trim();
  if (!key) {
    const error = new Error('HQ inválida.');
    error.code = 'INVALID_COMIC_ID';
    error.status = 400;
    throw error;
  }
  const current = await readRemoteState();
  const next = normalizeFavoriteRecord(key, { favorite: Boolean(favorite), updatedAt });
  if (isNewer(next, current.favorites[key])) current.favorites[key] = next;
  return publicState(await writeRemoteState(current));
}

export async function setSharedReading({ id, ...value } = {}) {
  const key = String(id || '').trim();
  if (!key) {
    const error = new Error('HQ inválida.');
    error.code = 'INVALID_COMIC_ID';
    error.status = 400;
    throw error;
  }
  const current = await readRemoteState();
  const next = normalizeReadingRecord(key, value);
  if (isNewer(next, current.reading[key])) current.reading[key] = next;
  return publicState(await writeRemoteState(current));
}
