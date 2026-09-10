import { isSupportedName, mimeForName } from './formats.js';
import { persistDiscoveredFiles, persistSourceStatus } from './catalogV2.js';

const FOLDER_MIME = 'application/vnd.google-apps.folder';

function cleanPath(value = '') {
  return String(value || '').trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').replace(/\/{2,}/g, '/');
}

function apiKey() {
  return String(process.env.GOOGLE_DRIVE_API_KEY || '').trim();
}

export function hasGoogleDriveApiKey() {
  return Boolean(apiKey());
}

function driveApiError(message, code = 'DRIVE_API_ERROR', status = 502) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

async function listFolderPage(folderId, pageToken = '', resourceKey = '') {
  const key = apiKey();
  if (!key) throw driveApiError('Configure GOOGLE_DRIVE_API_KEY no .env para fazer uma varredura completa e paginada do Google Drive.', 'GOOGLE_DRIVE_API_KEY_REQUIRED', 503);

  const params = new URLSearchParams({
    key,
    q: `'${folderId}' in parents and trashed = false`,
    pageSize: '1000',
    spaces: 'drive',
    supportsAllDrives: 'true',
    includeItemsFromAllDrives: 'true',
    fields: 'nextPageToken,files(id,name,mimeType,size,resourceKey,webViewLink,thumbnailLink,modifiedTime,createdTime,parents,shortcutDetails)'
  });
  if (pageToken) params.set('pageToken', pageToken);

  const response = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
    headers: {
      Accept: 'application/json',
      ...(resourceKey ? { 'X-Goog-Drive-Resource-Keys': `${folderId}/${resourceKey}` } : {})
    },
    signal: AbortSignal.timeout(Number(process.env.GOOGLE_DRIVE_API_TIMEOUT_MS || 30000))
  });
  let body = null;
  try { body = await response.json(); } catch {}
  if (!response.ok) {
    const detail = body?.error?.message || `HTTP ${response.status}`;
    throw driveApiError(`Google Drive API: ${detail}`, 'GOOGLE_DRIVE_API_FAILED', response.status === 403 ? 403 : 502);
  }
  return body || { files: [] };
}

async function getFileMetadata(fileId, resourceKey = '') {
  const key = apiKey();
  if (!key) throw driveApiError('Configure GOOGLE_DRIVE_API_KEY no .env.', 'GOOGLE_DRIVE_API_KEY_REQUIRED', 503);
  const params = new URLSearchParams({
    key,
    supportsAllDrives: 'true',
    fields: 'id,name,mimeType,size,resourceKey,webViewLink,thumbnailLink,modifiedTime,createdTime,parents,shortcutDetails'
  });
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?${params}`, {
    headers: {
      Accept: 'application/json',
      ...(resourceKey ? { 'X-Goog-Drive-Resource-Keys': `${fileId}/${resourceKey}` } : {})
    },
    signal: AbortSignal.timeout(Number(process.env.GOOGLE_DRIVE_API_TIMEOUT_MS || 30000))
  });
  let body = null;
  try { body = await response.json(); } catch {}
  if (!response.ok) {
    const detail = body?.error?.message || `HTTP ${response.status}`;
    throw driveApiError(`Google Drive API: ${detail}`, 'GOOGLE_DRIVE_API_FILE_FAILED', response.status === 403 ? 403 : 502);
  }
  return body;
}

function initialState(source, continuation) {
  if (continuation?.sourceId === source.id && Array.isArray(continuation.queue)) {
    return {
      queue: continuation.queue.map((item) => ({ id: String(item.id), path: cleanPath(item.path || source.path || source.category), resourceKey: String(item.resourceKey || '') })),
      visited: new Set((continuation.visited || []).map(String)),
      filesFound: Number(continuation.filesFound || 0),
      foldersProcessed: Number(continuation.foldersProcessed || 0),
      failedFolders: Number(continuation.failedFolders || 0),
      retries: continuation.retries && typeof continuation.retries === 'object' ? { ...continuation.retries } : {}
    };
  }
  return {
    queue: [{ id: String(source.id), path: cleanPath(source.path || source.category || source.label || 'Outros'), resourceKey: String(source.resourceKey || '') }],
    visited: new Set(),
    filesFound: 0,
    foldersProcessed: 0,
    failedFolders: 0,
    retries: {}
  };
}

function normalizedFile(item, source, folderPath) {
  const name = String(item.name || '').trim();
  if (!item?.id || !name || !isSupportedName(name)) return null;
  return {
    id: String(item.id),
    name,
    mimeType: item.mimeType || mimeForName(name),
    size: Number(item.size || 0),
    path: cleanPath(folderPath),
    category: source.category || cleanPath(folderPath).split('/')[0] || 'Outros',
    publisher: source.category || null,
    sourceType: 'drive',
    sourceFolderId: String(source.id),
    sourceUrl: item.webViewLink || `https://drive.google.com/file/d/${item.id}/view`,
    resourceKey: item.resourceKey || '',
    thumbnailUrl: item.thumbnailLink || '',
    addedAt: item.createdTime || null,
    syncedAt: new Date().toISOString(),
    metadata: { modifiedTime: item.modifiedTime || null }
  };
}

export async function crawlDriveSourceApi(source, { continuation = null } = {}) {
  if (!source?.id) throw driveApiError('Fonte do Drive inválida.', 'INVALID_DRIVE_SOURCE', 400);
  const state = initialState(source, continuation);
  const maxFolders = Math.max(1, Number(process.env.DRIVE_SYNC_FOLDERS_PER_PASS || 60));
  const discovered = [];
  let foldersThisPass = 0;

  while (state.queue.length && foldersThisPass < maxFolders) {
    const current = state.queue.shift();
    if (!current?.id || state.visited.has(current.id)) continue;
    let pageToken = '';
    let folderFailed = false;

    try {
      do {
        const page = await listFolderPage(current.id, pageToken, current.resourceKey || '');
        for (const item of page.files || []) {
          if (!item?.id) continue;
          if (item.mimeType === FOLDER_MIME) {
            if (!state.visited.has(String(item.id))) {
              state.queue.push({
                id: String(item.id),
                path: cleanPath(`${current.path}/${item.name || 'Pasta'}`),
                resourceKey: item.resourceKey || ''
              });
            }
            continue;
          }

          // Resolve atalhos também. Bibliotecas grandes do Drive frequentemente
          // organizam coleções por shortcuts; ignorá-los faz a contagem parecer menor.
          if (item.mimeType === 'application/vnd.google-apps.shortcut' && item.shortcutDetails?.targetId) {
            const targetId = String(item.shortcutDetails.targetId);
            const targetMime = String(item.shortcutDetails.targetMimeType || '');
            if (targetMime === FOLDER_MIME) {
              state.queue.push({
                id: targetId,
                path: cleanPath(`${current.path}/${item.name || 'Atalho'}`),
                resourceKey: item.resourceKey || ''
              });
            } else {
              try {
                const target = await getFileMetadata(targetId, item.resourceKey || '');
                const file = normalizedFile({ ...target, name: item.name || target.name }, source, current.path);
                if (file) discovered.push(file);
              } catch (shortcutError) {
                console.warn('[DRIVE_API_SHORTCUT_FAILED]', targetId, shortcutError?.message || shortcutError);
              }
            }
            continue;
          }

          const file = normalizedFile(item, source, current.path);
          if (file) discovered.push(file);
        }
        pageToken = page.nextPageToken || '';
      } while (pageToken);
    } catch (error) {
      folderFailed = true;
      const attempts = Number(state.retries[current.id] || 0) + 1;
      state.retries[current.id] = attempts;
      console.warn('[DRIVE_API_FOLDER_FAILED]', source.label || source.id, current.id, `tentativa ${attempts}`, error?.message || error);
      if (attempts < 3) {
        // Falhas transitórias (429/5xx/rede) não podem fazer uma pasta inteira
        // desaparecer do catálogo. Ela volta ao fim da fila nesta mesma sync.
        state.queue.push(current);
      } else {
        state.failedFolders += 1;
        state.visited.add(current.id);
      }
    }

    if (!folderFailed) {
      state.visited.add(current.id);
      delete state.retries[current.id];
    }
    state.foldersProcessed += 1;
    foldersThisPass += 1;
    if (folderFailed && current.id === String(source.id) && state.filesFound === 0 && discovered.length === 0 && Number(state.retries[current.id] || 0) >= 3) throw driveApiError(`Não foi possível listar a raiz de “${source.label || source.id}”. Verifique se a pasta é pública e se a Drive API está habilitada.`, 'DRIVE_SOURCE_ROOT_FAILED', 502);
  }

  if (discovered.length) {
    await persistDiscoveredFiles(discovered);
    state.filesFound += discovered.length;
  }

  const complete = state.queue.length === 0;
  const status = {
    id: String(source.id),
    label: source.label || source.name || 'Google Drive',
    category: source.category || 'Outros',
    ok: state.failedFolders === 0,
    complete,
    files: state.filesFound,
    folders: state.foldersProcessed,
    failedFolders: state.failedFolders,
    engine: 'google-drive-api-v3',
    syncedAt: new Date().toISOString()
  };
  await persistSourceStatus(status);

  return {
    source,
    files: discovered,
    summary: status,
    complete,
    continuation: complete ? null : {
      sourceId: String(source.id),
      queue: state.queue,
      visited: [...state.visited],
      filesFound: state.filesFound,
      foldersProcessed: state.foldersProcessed,
      failedFolders: state.failedFolders,
      retries: state.retries
    }
  };
}
