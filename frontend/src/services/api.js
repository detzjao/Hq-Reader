import { upload } from '@vercel/blob/client';
import {
  acknowledgePendingSharedChanges,
  applySharedState,
  buildSharedStateMigration,
  getPendingSharedChanges,
  markSharedStateMigrated,
  queueFavoriteChange,
  queueReadingChange,
  sharedStateNeedsMigration
} from './libraryState.js';

const ADMIN_STORAGE_KEY = 'hq-reader:admin-token';
const LEGACY_DISCOVERED_STORAGE_KEY = 'hq-reader:drive-sync-files';
const LEGACY_CUSTOM_SOURCES_STORAGE_KEY = 'hq-reader:custom-drive-sources';

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

function getLegacyCustomSources() {
  try {
    const parsed = JSON.parse(localStorage.getItem(LEGACY_CUSTOM_SOURCES_STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter((item) => item?.id && item?.url) : [];
  } catch { return []; }
}

function getLegacyDiscoveredComics() {
  try {
    const parsed = JSON.parse(localStorage.getItem(LEGACY_DISCOVERED_STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter((item) => item?.id && item?.name) : [];
  } catch { return []; }
}

function clearLegacyCustomSources() {
  try { localStorage.removeItem(LEGACY_CUSTOM_SOURCES_STORAGE_KEY); } catch {}
}

function clearLegacyDiscoveredComics() {
  try { localStorage.removeItem(LEGACY_DISCOVERED_STORAGE_KEY); } catch {}
}

function mergeLegacyDiscovered(serverFiles = []) {
  const byId = new Map((serverFiles || []).filter((item) => item?.id).map((item) => [item.id, item]));
  for (const item of getLegacyDiscoveredComics()) if (item?.id && !byId.has(item.id)) byId.set(item.id, item);
  return [...byId.values()];
}

async function migrateLegacyDeviceState() {
  if (!getAdminToken()) return false;
  let changed = false;

  const sources = getLegacyCustomSources();
  if (sources.length) {
    try {
      const result = await request('/api/library', {
        method: 'POST',
        admin: true,
        timeout: 60_000,
        body: JSON.stringify({ action: 'register-sources', sources })
      });
      if (!result?.failed?.length) {
        clearLegacyCustomSources();
        changed = true;
      }
    } catch {}
  }

  // A 2.1.5 apagava esse cache depois de migrar apenas as fontes. Esse cache pode
  // conter centenas de HQs já descobertas. Agora ele é enviado ao catálogo remoto
  // em lotes e só é removido do navegador depois da confirmação do servidor.
  const discovered = getLegacyDiscoveredComics();
  if (discovered.length) {
    let migratedAll = true;
    for (let offset = 0; offset < discovered.length; offset += 200) {
      const batch = discovered.slice(offset, offset + 200);
      try {
        const result = await request('/api/library', {
          method: 'POST',
          admin: true,
          timeout: 90_000,
          body: JSON.stringify({ action: 'recover-files', files: batch })
        });
        if (result?.persisted !== true) { migratedAll = false; break; }
      } catch {
        migratedAll = false;
        break;
      }
    }
    if (migratedAll) {
      clearLegacyDiscoveredComics();
      changed = true;
    }
  }

  return changed;
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
  // Enquanto um cache antigo ainda não foi migrado, não deixa a interface regredir
  // para o seed de 698 itens. O servidor continua sendo a fonte canônica assim que
  // a migração for confirmada.
  return { ...response, files: mergeLegacyDiscovered(response.files || []) };
}

async function getComic(id) {
  return request(`/api/comic?id=${encodeURIComponent(id)}`);
}

async function syncLibrarySources({ onProgress, sourceIds = [] } = {}) {
  let status = { sources: [] };
  try { status = await request('/api/library', { timeout: 30_000 }); } catch {}

  // Migra fontes e HQs descobertas por versões antigas sem apagar nada antes da
  // confirmação do armazenamento compartilhado.
  if (await migrateLegacyDeviceState()) {
    try { status = await request(`/api/library?fresh=${Date.now()}`, { timeout: 30_000 }); } catch {}
  }

  const sourceById = new Map();
  for (const source of status.sources || []) if (source?.id) sourceById.set(source.id, source);
  splitLegacyMarvelExtraSource(sourceById);
  const requestedSourceIds = new Set((Array.isArray(sourceIds) ? sourceIds : []).map((id) => String(id || '').trim()).filter(Boolean));
  const sources = [...sourceById.values()].filter((source) => !requestedSourceIds.size || requestedSourceIds.has(source.id));

  if (!sources.length) {
    return request('/api/library', {
      method: 'POST',
      timeout: 290_000,
      body: JSON.stringify({ action: 'sync' })
    });
  }

  const allFiles = new Map();
  const summaries = [];
  let added = 0;
  let total = Number(status.total || 0);
  let persisted = false;

  // Uma fonte grande é dividida em várias execuções. Cada execução salva o que
  // encontrou antes de continuar. Isso impede MARVEL DRIVE e outros Drives grandes
  // de perderem tudo quando chegam perto do limite de duração da Function.
  for (let index = 0; index < sources.length; index += 1) {
    const source = sources[index];
    let continuation = null;
    let sourceSummary = null;
    let sourceFiles = 0;
    let sourceFolders = 0;
    let sourceFailedFolders = 0;
    let pass = 0;
    const maxPasses = 60;

    try {
      do {
        pass += 1;
        const result = await request('/api/library', {
          method: 'POST',
          timeout: 290_000,
          body: JSON.stringify({
            action: 'sync',
            sourceIds: [source.id],
            ...(continuation ? { continuation } : {})
          })
        });

        for (const file of result.files || []) if (file?.id) allFiles.set(file.id, file);
        added += Number(result.added || 0);
        total = Math.max(total, Number(result.total || 0));
        persisted = persisted || Boolean(result.persisted);

        const chunkSummary = (result.sources || []).find((item) => item.id === source.id) || (result.sources || [])[0];
        if (!chunkSummary?.ok) throw new ApiError(chunkSummary?.error || 'Falha na varredura.', { code: 'DRIVE_SYNC_FAILED' });

        sourceFiles += Number(chunkSummary.files || 0);
        sourceFolders += Number(chunkSummary.foldersProcessed || chunkSummary.folders || 0);
        sourceFailedFolders += Number(chunkSummary.failedFolders || 0);
        continuation = chunkSummary.continuation || null;
        sourceSummary = {
          ...chunkSummary,
          files: sourceFiles,
          folders: sourceFolders,
          failedFolders: sourceFailedFolders,
          passes: pass,
          complete: !continuation && chunkSummary.complete !== false
        };

        if (onProgress) await onProgress({
          source,
          index,
          totalSources: sources.length,
          pass,
          continuation: Boolean(continuation),
          result
        });

        // Recarrega o catálogo entre os lotes para a interface mostrar o crescimento
        // e para a próxima execução partir do snapshot recém-persistido.
        if (continuation) {
          try {
            const fresh = await getComics(true);
            total = Math.max(total, Number(fresh.files?.length || 0));
          } catch {}
        }
      } while (continuation && pass < maxPasses);

      if (continuation) {
        throw new ApiError('A varredura atingiu o limite de lotes e será retomada na próxima atualização.', { code: 'DRIVE_SYNC_CONTINUATION_LIMIT' });
      }
      summaries.push(sourceSummary || { id: source.id, label: source.label, category: source.category, ok: true, complete: true });
    } catch (error) {
      summaries.push({
        id: source.id,
        label: source.label,
        category: source.category,
        ok: false,
        complete: false,
        files: sourceFiles,
        folders: sourceFolders,
        failedFolders: sourceFailedFolders,
        passes: pass,
        error: error.message || 'Falha na varredura.'
      });
      if (onProgress) await onProgress({ source, index, totalSources: sources.length, pass, error });
    }
  }

  const successful = summaries.filter((item) => item.ok && item.complete !== false).length;
  return {
    ok: successful > 0,
    partial: successful < summaries.length,
    complete: successful === summaries.length,
    sources: summaries,
    files: [...allFiles.values()],
    found: allFiles.size,
    added,
    total,
    persisted
  };
}


async function getSharedUserState(fresh = false) {
  return request(`/api/user-state${fresh ? `?fresh=${Date.now()}` : ''}`, { timeout: 30_000 });
}

async function mergeSharedUserState(payload) {
  return request('/api/user-state', {
    method: 'POST',
    timeout: 30_000,
    body: JSON.stringify({ action: 'merge', favorites: payload?.favorites || [], reading: payload?.reading || [] })
  });
}

async function syncSharedUserState() {
  // Primeira versão compartilhada: migra favoritos/progresso que já estavam
  // salvos somente neste navegador sem apagá-los antes da confirmação remota.
  if (sharedStateNeedsMigration()) {
    const migration = buildSharedStateMigration();
    if (migration.favorites.length || migration.reading.length) {
      const result = await mergeSharedUserState(migration);
      if (result?.state) applySharedState(result.state);
    }
    markSharedStateMigrated();
  }

  const pending = getPendingSharedChanges();
  if (pending.favorites.length || pending.reading.length) {
    const result = await mergeSharedUserState(pending);
    if (result?.state) applySharedState(result.state);
    acknowledgePendingSharedChanges(pending);
  }

  const remote = await getSharedUserState(true);
  applySharedState(remote);
  return remote;
}

async function setSharedFavorite(id, favorite) {
  const op = queueFavoriteChange(id, favorite);
  if (!op) return null;
  try {
    const result = await request('/api/user-state', {
      method: 'POST',
      timeout: 30_000,
      body: JSON.stringify({ action: 'favorite', ...op })
    });
    acknowledgePendingSharedChanges({ favorites: [op], reading: [] });
    if (result?.state) applySharedState(result.state);
    return result?.state || null;
  } catch (error) {
    // A alteração fica na fila local e será reenviada quando voltar a ficar online.
    throw error;
  }
}

async function saveSharedReading(state) {
  const op = queueReadingChange(state);
  if (!op) return null;
  try {
    const result = await request('/api/user-state', {
      method: 'POST',
      timeout: 30_000,
      body: JSON.stringify({ action: 'reading', ...op }),
      keepalive: true
    });
    acknowledgePendingSharedChanges({ favorites: [], reading: [op] });
    if (result?.state) applySharedState(result.state);
    return result?.state || null;
  } catch (error) {
    throw error;
  }
}

async function addToLibrary({ url, name, path }) {
  const result = await request('/api/library-add', {
    method: 'POST',
    admin: true,
    timeout: 290_000,
    body: JSON.stringify({ url, name, path })
  });
  if (result?.type === 'folder' && result.sourcePersisted !== true) {
    throw new ApiError('O Drive não foi salvo na biblioteca compartilhada.', { status: 503, code: 'PERSISTENT_LIBRARY_UNAVAILABLE' });
  }
  return result;
}

export const api = {
  health: () => request('/api/health'),
  getComics,
  getComic,
  syncLibrarySources,
  getSharedUserState,
  syncSharedUserState,
  setSharedFavorite,
  saveSharedReading,
  getArchivePages: (id) => request(`/api/archive?id=${encodeURIComponent(id)}`, { timeout: 120_000 }),
  getLibraryStatus: (fresh = false) => request(`/api/library${fresh ? `?fresh=${Date.now()}` : ''}`),
  addToLibrary,
  importLibrary: (text) => request('/api/library-import', { method: 'POST', admin: true, body: JSON.stringify({ text }), timeout: 60_000 }),
  registerUpload: ({ blob, originalName, size, path, thumbnailUrl }) => request('/api/library-upload-meta', { method: 'POST', admin: true, body: JSON.stringify({ blob, originalName, size, path, thumbnailUrl }) }),
  removeFromLibrary: (id) => request(`/api/library-delete?id=${encodeURIComponent(id)}`, { method: 'DELETE', admin: true }),
  assetUrl: (value = '') => /^https?:\/\//i.test(value) ? value : value,
  downloadUrl: (id) => `/api/download?id=${encodeURIComponent(id)}`
};
