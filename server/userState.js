import { hasSupabaseRead, hasSupabaseWrite } from './supabase.js';
import { readSupabaseSharedState, writeSupabaseSharedState } from './supabaseStore.js';

const caches = new Map();

function emptyState() {
  return { version: 1, updatedAt: null, favorites: {}, reading: {} };
}

function cleanTimestamp(value, fallback = null) {
  const time = Date.parse(value || '');
  return Number.isFinite(time) ? new Date(time).toISOString() : fallback;
}

function normalizeFavoriteRecord(id, value = {}) {
  const updatedAt = cleanTimestamp(value.updatedAt, new Date().toISOString());
  return { id: String(id), favorite: value.favorite !== false, updatedAt };
}

function normalizeReadingRecord(id, value = {}) {
  const lastPage = Math.max(1, Number(value.lastPage || value.page || 1) || 1);
  const totalPages = Math.max(0, Number(value.totalPages || value.total || 0) || 0);
  const completed = Boolean(value.completed || (totalPages > 0 && lastPage >= totalPages));
  const updatedAt = cleanTimestamp(value.updatedAt, new Date().toISOString());
  return {
    id: String(id), started: value.started !== false, lastPage, totalPages, completed,
    startedAt: cleanTimestamp(value.startedAt, updatedAt), updatedAt
  };
}

function normalizeState(value = {}) {
  const state = emptyState();
  state.updatedAt = cleanTimestamp(value.updatedAt, null);
  for (const [id, record] of Object.entries(value.favorites && !Array.isArray(value.favorites) ? value.favorites : {})) {
    if (id) state.favorites[id] = normalizeFavoriteRecord(id, record || {});
  }
  for (const [id, record] of Object.entries(value.reading && !Array.isArray(value.reading) ? value.reading : {})) {
    if (id) state.reading[id] = normalizeReadingRecord(id, record || {});
  }
  return state;
}

function publicState(state) {
  const normalized = normalizeState(state);
  const favoriteIds = Object.values(normalized.favorites).filter((record) => record.favorite).map((record) => record.id);
  return { ...normalized, favoriteIds, persistent: hasSupabaseWrite() };
}

async function readRemoteState(profileKey) {
  if (!hasSupabaseRead()) return emptyState();
  const value = await readSupabaseSharedState(profileKey);
  return normalizeState(value || {});
}

async function writeRemoteState(profileKey, state) {
  const normalized = normalizeState(state);
  const payload = { ...normalized, updatedAt: new Date().toISOString() };
  if (!hasSupabaseWrite()) {
    // Em desenvolvimento, a falta da chave server-side não pode derrubar a UI.
    // O frontend mantém sua fila/localStorage e o servidor conserva um espelho
    // em memória até ser reiniciado.
    caches.set(profileKey, { at: Date.now(), value: payload });
    return payload;
  }
  try {
    const saved = normalizeState(await writeSupabaseSharedState(payload, profileKey));
    caches.set(profileKey, { at: Date.now(), value: saved });
    return saved;
  } catch (error) {
    console.warn('[USER_STATE_REMOTE_WRITE_FAILED]', error?.message || error);
    caches.set(profileKey, { at: Date.now(), value: payload });
    return payload;
  }
}

function isNewer(next, previous) {
  const nextTime = Date.parse(next?.updatedAt || 0) || 0;
  const previousTime = Date.parse(previous?.updatedAt || 0) || 0;
  return !previous || nextTime >= previousTime;
}

export async function getSharedUserState(profileKey, { force = false } = {}) {
  const cache = caches.get(profileKey);
  if (!force && cache?.value && Date.now() - cache.at < 2000) return publicState(cache.value);
  const state = await readRemoteState(profileKey);
  caches.set(profileKey, { at: Date.now(), value: state });
  return publicState(state);
}

export async function mergeSharedUserState(profileKey, { favorites = [], reading = [] } = {}) {
  const current = await readRemoteState(profileKey);
  for (const value of Array.isArray(favorites) ? favorites.slice(0, 10000) : []) {
    const id = String(value?.id || '').trim(); if (!id) continue;
    const next = normalizeFavoriteRecord(id, value);
    if (isNewer(next, current.favorites[id])) current.favorites[id] = next;
  }
  for (const value of Array.isArray(reading) ? reading.slice(0, 10000) : []) {
    const id = String(value?.id || '').trim(); if (!id) continue;
    const next = normalizeReadingRecord(id, value);
    if (isNewer(next, current.reading[id])) current.reading[id] = next;
  }
  return publicState(await writeRemoteState(profileKey, current));
}

export async function setSharedFavorite(profileKey, { id, favorite, updatedAt } = {}) {
  const key = String(id || '').trim();
  if (!key) { const error = new Error('HQ inválida.'); error.code = 'INVALID_COMIC_ID'; error.status = 400; throw error; }
  const current = await readRemoteState(profileKey);
  const next = normalizeFavoriteRecord(key, { favorite: Boolean(favorite), updatedAt });
  if (isNewer(next, current.favorites[key])) current.favorites[key] = next;
  return publicState(await writeRemoteState(profileKey, current));
}

export async function setSharedReading(profileKey, { id, ...value } = {}) {
  const key = String(id || '').trim();
  if (!key) { const error = new Error('HQ inválida.'); error.code = 'INVALID_COMIC_ID'; error.status = 400; throw error; }
  const current = await readRemoteState(profileKey);
  const next = normalizeReadingRecord(key, value);
  if (isNewer(next, current.reading[key])) current.reading[key] = next;
  return publicState(await writeRemoteState(profileKey, current));
}
