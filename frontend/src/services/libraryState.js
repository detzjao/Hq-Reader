const FAVORITES_KEY = 'hq-reader:favorites:v1';
const READING_PREFIX = 'hq-reader:reading:';
const LEGACY_PROGRESS_PREFIX = 'hq-reader:progress:';
const FAVORITES_EVENT = 'hq-reader:favorites-updated';
const READING_EVENT = 'hq-reader:reading-updated';

function safeParse(value, fallback) {
  try { return JSON.parse(value); } catch { return fallback; }
}

function emit(name, detail) {
  try { window.dispatchEvent(new CustomEvent(name, { detail })); } catch {}
}

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

    // Compatibilidade com o progresso numérico usado nas versões anteriores.
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

export function saveReadingState(id, { lastPage = 1, totalPages = 0, completed = false } = {}) {
  const key = String(id || '').trim();
  if (!key) return null;
  const previous = getReadingState(key);
  const now = new Date().toISOString();
  const state = normalizeReadingState(key, {
    started: true,
    lastPage,
    totalPages,
    completed,
    startedAt: previous?.startedAt || now,
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
    completed: previous?.completed || (Number(totalPages) > 0 && (previous?.lastPage || 1) >= Number(totalPages))
  });
}

export const libraryStateEvents = {
  favorites: FAVORITES_EVENT,
  reading: READING_EVENT,
  favoritesStorageKey: FAVORITES_KEY,
  readingPrefix: READING_PREFIX,
  legacyProgressPrefix: LEGACY_PROGRESS_PREFIX
};
