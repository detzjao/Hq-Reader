const FAVORITES_KEY = 'hq-reader:favorites:v1';
const READING_PREFIX = 'hq-reader:reading:';
const LEGACY_PROGRESS_PREFIX = 'hq-reader:progress:';
const FAVORITES_EVENT = 'hq-reader:favorites-updated';
const READING_EVENT = 'hq-reader:reading-updated';
const PENDING_KEY = 'hq-reader:shared-state-pending:v1';
const MIGRATION_KEY = 'hq-reader:shared-state-migrated:v1';

function safeParse(value, fallback) {
  try { return JSON.parse(value); } catch { return fallback; }
}

function emit(name, detail) {
  try { window.dispatchEvent(new CustomEvent(name, { detail })); } catch {}
}

function nowIso() { return new Date().toISOString(); }

export function getFavoriteIds() {
  try {
    const parsed = safeParse(localStorage.getItem(FAVORITES_KEY) || '[]', []);
    return new Set(Array.isArray(parsed) ? parsed.filter(Boolean).map(String) : []);
  } catch { return new Set(); }
}

export function isFavorite(id) {
  return getFavoriteIds().has(String(id));
}

export function setFavorite(id, favorite) {
  const key = String(id || '').trim();
  if (!key) return false;
  const ids = getFavoriteIds();
  if (favorite) ids.add(key);
  else ids.delete(key);
  try { localStorage.setItem(FAVORITES_KEY, JSON.stringify([...ids])); } catch {}
  emit(FAVORITES_EVENT, { id: key, favorite: Boolean(favorite) });
  return Boolean(favorite);
}

export function toggleFavorite(id) {
  const next = !isFavorite(id);
  return setFavorite(id, next);
}

function normalizeReadingState(id, value = {}) {
  const lastPage = Math.max(1, Number(value.lastPage || value.page || 1) || 1);
  const totalPages = Math.max(0, Number(value.totalPages || value.total || 0) || 0);
  const completed = Boolean(value.completed || (totalPages > 0 && lastPage >= totalPages));
  return {
    id: String(id),
    started: value.started !== false,
    lastPage,
    totalPages,
    completed,
    startedAt: value.startedAt || null,
    updatedAt: value.updatedAt || null
  };
}

export function getReadingState(id) {
  const key = String(id || '').trim();
  if (!key) return null;
  try {
    const raw = localStorage.getItem(`${READING_PREFIX}${key}`);
    if (raw) {
      const parsed = safeParse(raw, null);
      if (parsed && typeof parsed === 'object') return normalizeReadingState(key, parsed);
    }

    const legacy = Number(localStorage.getItem(`${LEGACY_PROGRESS_PREFIX}${key}`));
    if (Number.isInteger(legacy) && legacy > 1) {
      return normalizeReadingState(key, { started: true, lastPage: legacy });
    }
  } catch {}
  return null;
}

export function getReadingStates(ids = []) {
  const states = {};
  for (const id of ids) {
    const state = getReadingState(id);
    if (state) states[String(id)] = state;
  }
  return states;
}

export function getAllReadingStates() {
  const states = {};
  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key?.startsWith(READING_PREFIX)) continue;
      const id = key.slice(READING_PREFIX.length);
      const state = getReadingState(id);
      if (state) states[id] = state;
    }
  } catch {}
  return states;
}

export function saveReadingState(id, { lastPage = 1, totalPages = 0, completed = false, startedAt = null, updatedAt = null } = {}) {
  const key = String(id || '').trim();
  if (!key) return null;
  const previous = getReadingState(key);
  const now = updatedAt || nowIso();
  const state = normalizeReadingState(key, {
    started: true,
    lastPage,
    totalPages,
    completed,
    startedAt: startedAt || previous?.startedAt || now,
    updatedAt: now
  });
  try {
    localStorage.setItem(`${READING_PREFIX}${key}`, JSON.stringify(state));
    localStorage.setItem(`${LEGACY_PROGRESS_PREFIX}${key}`, String(state.lastPage));
  } catch {}
  emit(READING_EVENT, state);
  return state;
}

export function markReadingStarted(id, totalPages = 0) {
  const previous = getReadingState(id);
  return saveReadingState(id, {
    lastPage: previous?.lastPage || 1,
    totalPages: totalPages || previous?.totalPages || 0,
    completed: previous?.completed || (Number(totalPages) > 0 && (previous?.lastPage || 1) >= Number(totalPages)),
    startedAt: previous?.startedAt || null
  });
}

function getPending() {
  try {
    const parsed = safeParse(localStorage.getItem(PENDING_KEY) || '{}', {});
    return {
      favorites: parsed?.favorites && typeof parsed.favorites === 'object' ? parsed.favorites : {},
      reading: parsed?.reading && typeof parsed.reading === 'object' ? parsed.reading : {}
    };
  } catch { return { favorites: {}, reading: {} }; }
}

function savePending(value) {
  try { localStorage.setItem(PENDING_KEY, JSON.stringify(value)); } catch {}
}

export function queueFavoriteChange(id, favorite, updatedAt = nowIso()) {
  const key = String(id || '').trim();
  if (!key) return null;
  const pending = getPending();
  const op = { id: key, favorite: Boolean(favorite), updatedAt };
  pending.favorites[key] = op;
  savePending(pending);
  return op;
}

export function queueReadingChange(state) {
  if (!state?.id) return null;
  const pending = getPending();
  const op = { ...normalizeReadingState(state.id, state), updatedAt: state.updatedAt || nowIso() };
  pending.reading[op.id] = op;
  savePending(pending);
  return op;
}

export function getPendingSharedChanges() {
  const pending = getPending();
  return {
    favorites: Object.values(pending.favorites),
    reading: Object.values(pending.reading)
  };
}

export function acknowledgePendingSharedChanges(sent = {}) {
  const current = getPending();
  for (const op of sent.favorites || []) {
    const existing = current.favorites[op.id];
    if (existing && existing.updatedAt === op.updatedAt) delete current.favorites[op.id];
  }
  for (const op of sent.reading || []) {
    const existing = current.reading[op.id];
    if (existing && existing.updatedAt === op.updatedAt) delete current.reading[op.id];
  }
  savePending(current);
}

export function sharedStateNeedsMigration() {
  try { return localStorage.getItem(MIGRATION_KEY) !== '1'; } catch { return true; }
}

export function buildSharedStateMigration() {
  const updatedAt = nowIso();
  const favorites = [...getFavoriteIds()].map((id) => ({ id, favorite: true, updatedAt }));
  const reading = Object.values(getAllReadingStates()).map((state) => ({
    ...state,
    startedAt: state.startedAt || updatedAt,
    updatedAt: state.updatedAt || updatedAt
  }));
  return { favorites, reading };
}

export function markSharedStateMigrated() {
  try { localStorage.setItem(MIGRATION_KEY, '1'); } catch {}
}

export function applySharedState(remote = {}) {
  const pending = getPending();
  const favoriteSet = new Set(Array.isArray(remote.favoriteIds)
    ? remote.favoriteIds.map(String)
    : Object.values(remote.favorites || {}).filter((record) => record?.favorite).map((record) => String(record.id)));
  // Operações ainda não confirmadas pelo servidor continuam visíveis localmente.
  for (const op of Object.values(pending.favorites)) {
    if (op.favorite) favoriteSet.add(String(op.id));
    else favoriteSet.delete(String(op.id));
  }
  const favoriteIds = [...favoriteSet];
  try { localStorage.setItem(FAVORITES_KEY, JSON.stringify(favoriteIds)); } catch {}

  const remoteReading = remote.reading && typeof remote.reading === 'object' ? { ...remote.reading } : {};
  for (const [id, state] of Object.entries(pending.reading)) {
    const remoteTime = Date.parse(remoteReading[id]?.updatedAt || 0) || 0;
    const pendingTime = Date.parse(state?.updatedAt || 0) || 0;
    if (!remoteReading[id] || pendingTime >= remoteTime) remoteReading[id] = state;
  }
  try {
    const staleKeys = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key?.startsWith(READING_PREFIX)) staleKeys.push(key);
    }
    for (const key of staleKeys) {
      const id = key.slice(READING_PREFIX.length);
      if (!remoteReading[id]) localStorage.removeItem(key);
    }
    for (const [id, value] of Object.entries(remoteReading)) {
      const state = normalizeReadingState(id, value);
      localStorage.setItem(`${READING_PREFIX}${id}`, JSON.stringify(state));
      localStorage.setItem(`${LEGACY_PROGRESS_PREFIX}${id}`, String(state.lastPage));
    }
  } catch {}

  emit(FAVORITES_EVENT, { shared: true });
  emit(READING_EVENT, { shared: true });
  return { favoriteIds: new Set(favoriteIds), reading: remoteReading };
}

export const libraryStateEvents = {
  favorites: FAVORITES_EVENT,
  reading: READING_EVENT,
  favoritesStorageKey: FAVORITES_KEY,
  readingPrefix: READING_PREFIX,
  legacyProgressPrefix: LEGACY_PROGRESS_PREFIX,
  pendingStorageKey: PENDING_KEY
};
