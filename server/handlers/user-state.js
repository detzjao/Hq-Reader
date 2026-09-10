import { assertAuthenticatedRequest } from '../auth.js';
import { supabaseForAccessToken } from '../supabase.js';
import { sendError } from '../http.js';

const memory = new Map();

function emptyState() {
  return { version: 1, updatedAt: null, favorites: {}, reading: {}, favoriteIds: [], persistent: false };
}

function normalizeFavorite(id, value = {}) {
  return {
    id: String(id),
    favorite: value.favorite !== false,
    updatedAt: value.updatedAt || new Date().toISOString()
  };
}

function normalizeReading(id, value = {}) {
  const lastPage = Math.max(1, Number(value.lastPage || value.page || 1) || 1);
  const totalPages = Math.max(0, Number(value.totalPages || value.total || 0) || 0);
  return {
    id: String(id),
    started: value.started !== false,
    lastPage,
    totalPages,
    completed: Boolean(value.completed || (totalPages > 0 && lastPage >= totalPages)),
    startedAt: value.startedAt || value.updatedAt || new Date().toISOString(),
    updatedAt: value.updatedAt || new Date().toISOString()
  };
}

function normalizeState(input = {}) {
  const favorites = {};
  const reading = {};
  for (const [id, value] of Object.entries(input?.favorites || {})) {
    if (id) favorites[id] = normalizeFavorite(id, value || {});
  }
  for (const [id, value] of Object.entries(input?.reading || {})) {
    if (id) reading[id] = normalizeReading(id, value || {});
  }
  const favoriteIds = Object.values(favorites).filter((x) => x.favorite).map((x) => x.id);
  return {
    version: 1,
    updatedAt: input?.updatedAt || null,
    favorites,
    reading,
    favoriteIds,
    persistent: Boolean(input?.persistent)
  };
}

function mergeState(current, body = {}) {
  const next = normalizeState(current);
  for (const value of Array.isArray(body.favorites) ? body.favorites : []) {
    const id = String(value?.id || '').trim();
    if (id) next.favorites[id] = normalizeFavorite(id, value);
  }
  for (const value of Array.isArray(body.reading) ? body.reading : []) {
    const id = String(value?.id || '').trim();
    if (id) next.reading[id] = normalizeReading(id, value);
  }
  next.updatedAt = new Date().toISOString();
  next.favoriteIds = Object.values(next.favorites).filter((x) => x.favorite).map((x) => x.id);
  return next;
}

async function readState(scoped, userId) {
  if (scoped) {
    try {
      const { data, error } = await scoped
        .from('shared_user_state')
        .select('payload,updated_at')
        .eq('profile_key', userId)
        .maybeSingle();
      if (!error && data) {
        const value = normalizeState({ ...(data.payload || {}), updatedAt: data.payload?.updatedAt || data.updated_at, persistent: true });
        memory.set(userId, value);
        return value;
      }
      if (error) console.warn('[USER_STATE_READ_DEGRADED]', error.message);
    } catch (error) {
      console.warn('[USER_STATE_READ_DEGRADED]', error?.message || error);
    }
  }
  return normalizeState(memory.get(userId) || emptyState());
}

async function writeState(scoped, userId, state) {
  const payload = normalizeState({ ...state, updatedAt: new Date().toISOString() });
  memory.set(userId, payload);
  if (!scoped) return payload;
  try {
    const { error } = await scoped.from('shared_user_state').upsert({
      profile_key: userId,
      payload: { version: 1, updatedAt: payload.updatedAt, favorites: payload.favorites, reading: payload.reading },
      updated_at: payload.updatedAt
    }, { onConflict: 'profile_key' });
    if (!error) return { ...payload, persistent: true };
    console.warn('[USER_STATE_WRITE_DEGRADED]', error.message);
  } catch (error) {
    console.warn('[USER_STATE_WRITE_DEGRADED]', error?.message || error);
  }
  return { ...payload, persistent: false };
}

export default async function handler(req, res) {
  try {
    const { user, accessToken } = await assertAuthenticatedRequest(req);
    const scoped = supabaseForAccessToken(accessToken);
    const userId = String(user.id);

    if (req.method === 'GET') {
      res.setHeader('Cache-Control', 'private, no-store');
      return res.status(200).json(await readState(scoped, userId));
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const current = await readState(scoped, userId);
      let next = current;

      if (body.action === 'favorite') {
        const id = String(body.id || '').trim();
        if (!id) return res.status(400).json({ error: 'HQ inválida.', code: 'INVALID_COMIC_ID' });
        next = normalizeState(current);
        next.favorites[id] = normalizeFavorite(id, body);
      } else if (body.action === 'reading') {
        const id = String(body.id || '').trim();
        if (!id) return res.status(400).json({ error: 'HQ inválida.', code: 'INVALID_COMIC_ID' });
        next = normalizeState(current);
        next.reading[id] = normalizeReading(id, body);
      } else if (body.action === 'merge') {
        next = mergeState(current, body);
      } else {
        return res.status(400).json({ error: 'Ação inválida.', code: 'INVALID_USER_STATE_ACTION' });
      }

      const state = await writeState(scoped, userId, next);
      res.setHeader('Cache-Control', 'private, no-store');
      return res.status(200).json({ state });
    }

    return res.status(405).json({ error: 'Método não permitido.', code: 'METHOD_NOT_ALLOWED' });
  } catch (error) {
    return sendError(res, error);
  }
}
