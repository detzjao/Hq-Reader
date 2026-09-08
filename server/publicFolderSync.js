import { publicComic, getCatalog, isBlobConfigured, saveCatalogSource, saveSyncSnapshot } from './catalog.js';
import { ensureSupportedExtension, extension, isSupportedName, mimeForName } from './formats.js';
import { probePublicFile } from './googleDrive.js';
import { bootstrapFoldersForSource } from './sourceBootstrap.js';

function stripTags(value = '') {
  return value.replace(/<[^>]*>/g, ' ');
}

function decodeHtml(value = '') {
  return stripTags(String(value))
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/\\u003d/gi, '=')
    .replace(/\\u0026/gi, '&')
    .replace(/\\u003f/gi, '?')
    .replace(/\\u002f/gi, '/')
    .replace(/\\x3d/gi, '=')
    .replace(/\\x26/gi, '&')
    .replace(/\\x2f/gi, '/')
    .replace(/\\\//g, '/')
    .replace(/\\"/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function folderIdFromUrl(url = '') {
  const value = decodeHtml(url);
  return value.match(/\/folders\/([A-Za-z0-9_-]{10,})/i)?.[1] || '';
}

function fileIdFromUrl(url = '') {
  const value = decodeHtml(url);
  return value.match(/\/file\/d\/([A-Za-z0-9_-]{10,})/i)?.[1]
    || value.match(/\/d\/([A-Za-z0-9_-]{10,})/i)?.[1]
    || value.match(/[?&]id=([A-Za-z0-9_-]{10,})/i)?.[1]
    || '';
}

function resourceKeyFromUrl(url = '') {
  try {
    const parsed = new URL(decodeHtml(url));
    return parsed.searchParams.get('resourcekey') || parsed.searchParams.get('resourceKey') || '';
  } catch {
    const match = decodeHtml(url).match(/[?&]resourcekey=([^&#]+)/i);
    try { return match?.[1] ? decodeURIComponent(match[1]) : ''; } catch { return match?.[1] || ''; }
  }
}


export function parsePublicFolderLink(input) {
  const value = String(input || '').trim();
  if (!value) {
    const error = new Error('Informe um link público de pasta do Google Drive.');
    error.code = 'INVALID_DRIVE_FOLDER';
    error.status = 400;
    throw error;
  }

  if (/^[A-Za-z0-9_-]{10,}$/.test(value)) {
    return { id: value, url: `https://drive.google.com/drive/folders/${value}`, resourceKey: '' };
  }

  let url;
  try { url = new URL(value); } catch {
    const error = new Error('O link da pasta do Google Drive não é válido.');
    error.code = 'INVALID_DRIVE_FOLDER';
    error.status = 400;
    throw error;
  }
  if (!['drive.google.com', 'docs.google.com'].includes(url.hostname.toLowerCase())) {
    const error = new Error('O link precisa apontar para uma pasta pública do Google Drive.');
    error.code = 'INVALID_DRIVE_FOLDER';
    error.status = 400;
    throw error;
  }
  const id = url.pathname.match(/\/folders\/([A-Za-z0-9_-]{10,})/i)?.[1]
    || (/embeddedfolderview/i.test(url.pathname) ? String(url.searchParams.get('id') || '') : '');
  if (!/^[A-Za-z0-9_-]{10,}$/.test(id)) {
    const error = new Error('Não foi possível identificar a pasta nesse link do Google Drive.');
    error.code = 'INVALID_DRIVE_FOLDER';
    error.status = 400;
    throw error;
  }
  return {
    id,
    url: value,
    resourceKey: url.searchParams.get('resourcekey') || url.searchParams.get('resourceKey') || ''
  };
}

function cleanPath(value = '') {
  return String(value || '').trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').replace(/\/{2,}/g, '/');
}

export function normalizePublicFolderSource(input = {}) {
  const parsed = parsePublicFolderLink(input.url || input.id || '');
  const requestedPath = cleanPath(input.path || '');
  const requestedCategory = cleanPath(input.category || '').split('/')[0];
  const category = requestedCategory || requestedPath.split('/')[0] || String(input.label || '').trim() || 'Outros';
  const label = String(input.label || '').trim() || requestedPath.split('/').filter(Boolean).at(-1) || category || `Drive ${parsed.id.slice(-6)}`;
  return {
    id: parsed.id,
    label,
    category,
    path: requestedPath || category,
    url: parsed.url,
    resourceKey: input.resourceKey || parsed.resourceKey || '',
    enabled: input.enabled !== false
  };
}

function folderViewCandidates(folderId, resourceKey = '') {
  const params = new URLSearchParams({ id: folderId });
  if (resourceKey) params.set('resourcekey', resourceKey);
  const plain = params.toString();
  return [
    `https://drive.google.com/embeddedfolderview?${plain}#list`,
    `https://drive.google.com/u/0/embeddedfolderview?${plain}&pli=1#list`,
    `https://drive.google.com/drive/folders/${encodeURIComponent(folderId)}${resourceKey ? `?resourcekey=${encodeURIComponent(resourceKey)}&usp=sharing` : '?usp=sharing'}`
  ];
}

function absoluteDriveHref(value = '') {
  const decoded = decodeHtml(value);
  if (!decoded) return '';
  try { return new URL(decoded, 'https://drive.google.com').toString(); } catch { return decoded; }
}

export function parseEmbeddedFolderEntries(html) {
  const items = new Map();
  const anchorPattern = /<a\b[^>]*\bhref\s*=\s*(["'])([\s\S]*?)\1[^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = anchorPattern.exec(String(html || '')))) {
    const href = absoluteDriveHref(match[2]);
    if (!href || !/(?:drive|docs)\.google\.com/i.test(href)) continue;
    const title = decodeHtml(match[3]);
    const folderId = folderIdFromUrl(href);
    const fileId = fileIdFromUrl(href);
    if (folderId) {
      const key = `folder:${folderId}`;
      const previous = items.get(key);
      items.set(key, {
        type: 'folder',
        id: folderId,
        title: title || previous?.title || `Pasta ${folderId.slice(-6)}`,
        url: href,
        resourceKey: resourceKeyFromUrl(href) || previous?.resourceKey || ''
      });
      continue;
    }
    if (fileId && /drive\.google\.com/i.test(href)) {
      const key = `file:${fileId}`;
      const previous = items.get(key);
      items.set(key, {
        type: 'file',
        id: fileId,
        title: title || previous?.title || `HQ-${fileId.slice(-8)}`,
        url: href,
        resourceKey: resourceKeyFromUrl(href) || previous?.resourceKey || ''
      });
    }
  }
  return [...items.values()];
}

function mergeFolderItems(...groups) {
  const merged = new Map();
  for (const group of groups) {
    for (const item of group || []) {
      if (!item?.id || !item?.type) continue;
      const key = `${item.type}:${item.id}`;
      const previous = merged.get(key);
      merged.set(key, {
        ...(previous || {}),
        ...item,
        title: item.title && !/^HQ-[A-Za-z0-9_-]+(?:\.pdf)?$/i.test(item.title) ? item.title : (previous?.title || item.title),
        resourceKey: item.resourceKey || previous?.resourceKey || ''
      });
    }
  }
  return [...merged.values()];
}

function parseFlipEntries(html) {
  const items = [];
  const pattern = /<a\s+href=["'](https:\/\/drive\.google\.com\/[^"']+)["'][\s\S]*?<div\s+class=["']flip-entry-title["']>([\s\S]*?)<\/div>/gi;
  let match;
  while ((match = pattern.exec(html))) {
    const href = decodeHtml(match[1]);
    const title = decodeHtml(match[2]);
    if (!href || !title) continue;
    const folderId = folderIdFromUrl(href);
    const fileId = fileIdFromUrl(href);
    if (folderId) items.push({ type: 'folder', id: folderId, title, url: href, resourceKey: resourceKeyFromUrl(href) });
    else if (fileId) items.push({ type: 'file', id: fileId, title, url: href, resourceKey: resourceKeyFromUrl(href) });
  }
  return items;
}

function parseDrivePageFallback(html) {
  const items = new Map();
  const normalized = decodeHtml(html);

  const urlThenTitle = /(https:\/\/drive\.google\.com\/(?:file\/d\/|drive\/folders\/)[A-Za-z0-9_?&=\-./%]+)[\s\S]{0,1400}?["']([^"'<>]{1,240}\.(?:pdf|cbz|cbr|jpe?g|png|webp|gif))["']/gi;
  let match;
  while ((match = urlThenTitle.exec(normalized))) {
    const href = decodeHtml(match[1]);
    const title = decodeHtml(match[2]);
    const folderId = folderIdFromUrl(href);
    const fileId = fileIdFromUrl(href);
    if (folderId) items.set(`folder:${folderId}`, { type: 'folder', id: folderId, title: title.replace(/\.(pdf|cbz|cbr|jpe?g|png|webp|gif)$/i, ''), url: href, resourceKey: resourceKeyFromUrl(href) });
    else if (fileId) items.set(`file:${fileId}`, { type: 'file', id: fileId, title, url: href, resourceKey: resourceKeyFromUrl(href) });
  }

  const urls = normalized.match(/https:\/\/drive\.google\.com\/(?:file\/d\/[A-Za-z0-9_-]{10,}[^"'<>\s]*|drive\/folders\/[A-Za-z0-9_-]{10,}[^"'<>\s]*)/gi) || [];
  for (const hrefRaw of urls) {
    const href = decodeHtml(hrefRaw);
    const folderId = folderIdFromUrl(href);
    const fileId = fileIdFromUrl(href);
    if (folderId) items.set(`folder:${folderId}`, { type: 'folder', id: folderId, title: `Pasta ${folderId.slice(-6)}`, url: href, resourceKey: resourceKeyFromUrl(href) });
    else if (fileId && !items.has(`file:${fileId}`)) items.set(`file:${fileId}`, { type: 'file', id: fileId, title: `HQ-${fileId.slice(-8)}.pdf`, url: href, resourceKey: resourceKeyFromUrl(href) });
  }
  return [...items.values()];
}

async function fetchFolderItems(folderId, resourceKey = '') {
  let lastStatus = 0;
  let sawLogin = false;
  const timeoutMs = Number(process.env.PUBLIC_FOLDER_TIMEOUT_MS || 22_000);

  for (const candidate of folderViewCandidates(folderId, resourceKey)) {
    try {
      const response = await fetch(candidate, {
        redirect: 'follow',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/152 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.7'
        },
        signal: AbortSignal.timeout(timeoutMs)
      });
      lastStatus = response.status;
      if (!response.ok) { try { await response.body?.cancel(); } catch {} continue; }
      const html = await response.text();
      if (/ServiceLogin|accounts\.google\.com\/signin/i.test(html)) { sawLogin = true; continue; }
      const anchors = parseEmbeddedFolderEntries(html);
      const flip = parseFlipEntries(html);
      const fallback = parseDrivePageFallback(html);
      const items = mergeFolderItems(anchors, flip, fallback);
      if (items.length) return items;
    } catch {
      // tenta a próxima visualização pública
    }
  }

  const error = new Error(sawLogin
    ? 'A pasta não está disponível publicamente.'
    : lastStatus ? `Não foi possível ler a pasta pública (HTTP ${lastStatus}).` : 'Não foi possível acessar a pasta pública.');
  error.code = sawLogin ? 'PUBLIC_FOLDER_NOT_PUBLIC' : 'PUBLIC_FOLDER_UNAVAILABLE';
  error.status = sawLogin ? 403 : 502;
  throw error;
}

async function resolveShortcutTarget(item) {
  const timeoutMs = Number(process.env.PUBLIC_FOLDER_TIMEOUT_MS || 18_000);
  const candidates = [
    `https://drive.google.com/open?id=${encodeURIComponent(item.id)}`,
    `https://drive.google.com/file/d/${encodeURIComponent(item.id)}/view`
  ];
  for (const candidate of candidates) {
    try {
      const response = await fetch(candidate, {
        redirect: 'follow',
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/152 Safari/537.36' },
        signal: AbortSignal.timeout(timeoutMs)
      });
      const finalUrl = response.url || '';
      const html = (response.headers.get('content-type') || '').includes('text/html') ? await response.text() : '';
      const text = `${finalUrl} ${decodeHtml(html)}`;
      const folderMatch = text.match(/https:\/\/drive\.google\.com\/drive\/folders\/([A-Za-z0-9_-]{10,})/i);
      if (folderMatch?.[1] && folderMatch[1] !== item.id) return { type: 'folder', id: folderMatch[1], url: folderMatch[0] };
      const fileMatch = text.match(/https:\/\/drive\.google\.com\/file\/d\/([A-Za-z0-9_-]{10,})/i);
      if (fileMatch?.[1] && fileMatch[1] !== item.id) return { type: 'file', id: fileMatch[1], url: fileMatch[0] };
    } catch {}
  }
  return null;
}

function publicFileProbeInput(item) {
  return {
    id: item.id,
    resourceKey: item.resourceKey || resourceKeyFromUrl(item.url),
    sourceUrl: item.url || ''
  };
}

async function probeAndNormalizeFileItem(item) {
  try {
    const probe = await probePublicFile(publicFileProbeInput(item));
    const title = ensureSupportedExtension(
      probe.name || item.title || `HQ-${item.id.slice(-8)}`,
      probe.mimeType,
      `HQ-${item.id.slice(-8)}`
    );
    if (isSupportedName(title)) {
      return {
        type: 'file',
        item: {
          ...item,
          id: probe.id || item.id,
          title,
          mimeType: probe.mimeType || mimeForName(title),
          size: Number(probe.size || 0),
          resourceKey: probe.resourceKey || item.resourceKey || '',
          url: probe.sourceUrl || item.url || ''
        }
      };
    }
  } catch {
    // Pode ser atalho ou item que o endpoint direto ainda não resolveu.
  }

  const target = await resolveShortcutTarget(item);
  if (target?.type === 'folder') {
    return {
      type: 'folder',
      item: {
        id: target.id,
        resourceKey: resourceKeyFromUrl(target.url),
        title: item.title || `Pasta ${target.id.slice(-6)}`,
        url: target.url
      }
    };
  }

  if (target?.type === 'file') {
    const targetItem = {
      ...item,
      id: target.id,
      url: target.url,
      resourceKey: resourceKeyFromUrl(target.url) || item.resourceKey || ''
    };
    try {
      const probe = await probePublicFile(publicFileProbeInput(targetItem));
      const title = ensureSupportedExtension(
        probe.name || targetItem.title || `HQ-${targetItem.id.slice(-8)}`,
        probe.mimeType,
        `HQ-${targetItem.id.slice(-8)}`
      );
      if (isSupportedName(title)) {
        return {
          type: 'file',
          item: {
            ...targetItem,
            title,
            mimeType: probe.mimeType || mimeForName(title),
            size: Number(probe.size || 0),
            resourceKey: probe.resourceKey || targetItem.resourceKey || ''
          }
        };
      }
    } catch {}
  }
  return null;
}

export async function resolvePublicFileCandidate(item) {
  if (!item?.id) return null;
  if (isSupportedName(item.title)) {
    return {
      type: 'file',
      item: {
        ...item,
        mimeType: item.mimeType || mimeForName(item.title),
        size: Number(item.size || 0)
      }
    };
  }
  return probeAndNormalizeFileItem(item);
}

async function crawlSource(source) {
  const maxFolders = Number(process.env.PUBLIC_FOLDER_MAX_FOLDERS || 3500);
  const maxFiles = Number(process.env.PUBLIC_FOLDER_MAX_FILES || 30_000);
  const bootstrapFolders = bootstrapFoldersForSource(source.id);
  const requestedConcurrency = Number(process.env.PUBLIC_FOLDER_CONCURRENCY || (bootstrapFolders.length ? 8 : 5));
  const concurrency = Math.max(1, Math.min(8, requestedConcurrency));
  const visitedFolders = new Set();
  const files = new Map();
  const rootPath = source.path || source.category;
  let frontier = [
    { id: source.id, path: rootPath, resourceKey: source.resourceKey || '' },
    ...bootstrapFolders.map((folder) => ({
      id: folder.id,
      path: folder.group
        ? `${rootPath}/${folder.group}`.replace(/\/{2,}/g, '/')
        : rootPath,
      resourceKey: folder.resourceKey || ''
    }))
  ];
  let failedFolders = 0;

  while (frontier.length) {
    const nextFrontier = [];
    for (let offset = 0; offset < frontier.length; offset += concurrency) {
      const batch = frontier.slice(offset, offset + concurrency).filter((folder) => !visitedFolders.has(folder.id));
      batch.forEach((folder) => visitedFolders.add(folder.id));
      if (!batch.length) continue;
      if (visitedFolders.size > maxFolders) {
        const error = new Error(`A fonte “${source.label}” excedeu o limite de pastas da varredura.`);
        error.code = 'PUBLIC_FOLDER_LIMIT';
        error.status = 413;
        throw error;
      }

      const results = await Promise.allSettled(batch.map(async (folder) => ({ folder, items: await fetchFolderItems(folder.id, folder.resourceKey) })));
      for (const result of results) {
        if (result.status === 'rejected') { failedFolders += 1; continue; }
        const { folder, items } = result.value;
        const fileCandidates = [];
        for (const item of items) {
          if (item.type === 'folder') {
            if (!visitedFolders.has(item.id)) nextFrontier.push({
              id: item.id,
              resourceKey: item.resourceKey || '',
              path: `${folder.path}/${item.title}`.replace(/\/{2,}/g, '/')
            });
          } else if (item.type === 'file') {
            fileCandidates.push(item);
          }
        }

        // Arquivos com extensão conhecida entram imediatamente. Itens sem extensão
        // são inspecionados em paralelo pelo MIME/assinatura do arquivo. Isso é
        // essencial para Drives que armazenam PDFs com nomes sem ".pdf".
        const probeConcurrency = Math.max(2, Math.min(8, Number(process.env.PUBLIC_FILE_PROBE_CONCURRENCY || 6)));
        for (let fileOffset = 0; fileOffset < fileCandidates.length; fileOffset += probeConcurrency) {
          const fileBatch = fileCandidates.slice(fileOffset, fileOffset + probeConcurrency);
          const resolvedBatch = await Promise.allSettled(fileBatch.map(resolvePublicFileCandidate));
          for (let fileIndex = 0; fileIndex < resolvedBatch.length; fileIndex += 1) {
            const resolved = resolvedBatch[fileIndex];
            if (resolved.status !== 'fulfilled' || !resolved.value) continue;

            if (resolved.value.type === 'folder') {
              const targetFolder = resolved.value.item;
              if (targetFolder?.id && !visitedFolders.has(targetFolder.id)) {
                nextFrontier.push({
                  id: targetFolder.id,
                  resourceKey: targetFolder.resourceKey || '',
                  path: `${folder.path}/${targetFolder.title || fileBatch[fileIndex]?.title || 'Atalho'}`.replace(/\/{2,}/g, '/')
                });
              }
              continue;
            }

            const fileItem = resolved.value.item;
            if (!fileItem?.id || !isSupportedName(fileItem.title)) continue;
            files.set(fileItem.id, {
              id: fileItem.id,
              name: fileItem.title,
              mimeType: fileItem.mimeType || mimeForName(fileItem.title),
              size: Number(fileItem.size || 0),
              path: folder.path,
              category: source.category,
              sourceType: 'drive',
              sourceFolderId: source.id,
              sourceUrl: fileItem.url,
              resourceKey: fileItem.resourceKey || resourceKeyFromUrl(fileItem.url),
              addedAt: new Date().toISOString(),
              syncedAt: new Date().toISOString()
            });
            if (files.size > maxFiles) {
              const error = new Error(`A fonte “${source.label}” excedeu o limite de arquivos da varredura.`);
              error.code = 'PUBLIC_FOLDER_LIMIT';
              error.status = 413;
              throw error;
            }
          }
        }
      }
    }
    frontier = nextFrontier;
  }

  if (!files.size) {
    const error = new Error(`A fonte “${source.label}” não retornou HQs legíveis.`);
    error.code = 'PUBLIC_FOLDER_EMPTY';
    error.status = 502;
    throw error;
  }

  return { source, files: [...files.values()], folders: visitedFolders.size, failedFolders, bootstrapFolders: bootstrapFolders.length };
}

function transientPublicComic(file) {
  const comic = publicComic(file);
  const direct = new URLSearchParams({ id: file.id, direct: '1' });
  if (file.resourceKey) direct.set('resourceKey', file.resourceKey);
  comic.contentUrl = `/api/content?${direct.toString()}`;
  comic.resourceKey = file.resourceKey || '';
  comic.sourceFolderId = file.sourceFolderId || '';
  comic.discoveredBySync = true;
  return comic;
}

export async function syncConfiguredSources({ extraSources = [], sourceIds = [] } = {}) {
  const catalog = await getCatalog({ force: true });
  const sourceById = new Map();
  for (const source of catalog.sources || []) {
    if (source?.enabled === false || !source?.id || !source?.category) continue;
    sourceById.set(source.id, normalizePublicFolderSource(source));
  }
  for (const input of Array.isArray(extraSources) ? extraSources.slice(0, 20) : []) {
    try {
      const source = normalizePublicFolderSource(input);
      if (source.enabled !== false) sourceById.set(source.id, source);
    } catch {
      // Ignora fontes locais antigas ou inválidas sem derrubar a sincronização das demais.
    }
  }
  const requestedSourceIds = new Set((Array.isArray(sourceIds) ? sourceIds : []).map((id) => String(id || '').trim()).filter(Boolean));
  const sources = [...sourceById.values()].filter((source) => !requestedSourceIds.size || requestedSourceIds.has(source.id));
  if (!sources.length) return { ok: true, files: [], sources: [], added: 0, found: 0, total: catalog.files.length, persisted: false };

  const results = await Promise.allSettled(sources.map(crawlSource));
  const existingIds = new Set(catalog.files.map((file) => file.id));
  const foundById = new Map();
  const summaries = [];

  results.forEach((result, index) => {
    const source = sources[index];
    if (result.status === 'rejected') {
      summaries.push({ id: source.id, label: source.label, category: source.category, ok: false, error: result.reason?.message || 'Falha na varredura.' });
      return;
    }
    for (const file of result.value.files) foundById.set(file.id, file);
    summaries.push({
      id: source.id,
      label: source.label,
      category: source.category,
      ok: true,
      files: result.value.files.length,
      folders: result.value.folders,
      failedFolders: result.value.failedFolders,
      bootstrapFolders: result.value.bootstrapFolders || 0
    });
  });

  const found = [...foundById.values()];
  const added = found.reduce((count, file) => count + (existingIds.has(file.id) ? 0 : 1), 0);
  let persisted = false;
  if (found.length && isBlobConfigured()) {
    try {
      // Cada fonte pode ser sincronizada em uma requisição separada. Mantém o catálogo
      // já conhecido no snapshot para a próxima fonte não apagar os resultados anteriores.
      await saveSyncSnapshot([...catalog.files, ...found]);
      persisted = true;
    } catch {
      // Não confirma uma sincronização que existiria só neste aparelho. Para a biblioteca
      // ser igual em todos os dispositivos, os resultados precisam chegar ao catálogo global.
      throw persistentStorageError('As HQs foram encontradas, mas não foi possível salvá-las na biblioteca compartilhada.');
    }
  }

  const successful = summaries.filter((item) => item.ok).length;
  return {
    ok: successful > 0,
    partial: successful > 0 && successful < summaries.length,
    sources: summaries,
    files: found.map(transientPublicComic),
    found: found.length,
    added,
    total: new Set([...existingIds, ...foundById.keys()]).size,
    persisted
  };
}

function persistentStorageError(message = 'Não foi possível salvar a biblioteca de forma compartilhada no servidor.') {
  const error = new Error(message);
  error.code = 'PERSISTENT_LIBRARY_UNAVAILABLE';
  error.status = 503;
  return error;
}

export async function registerPublicFolderSources(inputs = []) {
  if (!isBlobConfigured()) throw persistentStorageError();
  const sources = [];
  const failed = [];
  const unique = new Map();
  for (const input of Array.isArray(inputs) ? inputs.slice(0, 50) : []) {
    try {
      const source = normalizePublicFolderSource(input);
      unique.set(source.id, source);
    } catch (error) {
      failed.push({ input: input?.url || input?.id || '', error: error?.message || 'Fonte inválida.' });
    }
  }
  for (const source of unique.values()) {
    try {
      const persisted = await saveCatalogSource(source);
      if (!persisted) throw persistentStorageError();
      sources.push(source);
    } catch (error) {
      failed.push({ id: source.id, label: source.label, error: error?.message || 'Falha ao salvar a fonte.' });
    }
  }
  if (!sources.length && unique.size) throw persistentStorageError(failed[0]?.error || undefined);
  return { saved: sources.length, sources, failed };
}

export async function addPublicFolderSource({ url, label = '', path = '', category = '' } = {}) {
  const source = normalizePublicFolderSource({ url, label, path, category });
  if (!isBlobConfigured()) throw persistentStorageError();
  const sourcePersisted = await saveCatalogSource(source);
  if (!sourcePersisted) throw persistentStorageError();

  // A fonte primeiro vira parte do catálogo compartilhado. Só depois iniciamos a
  // varredura. Assim, mesmo que um Drive enorme demore ou falhe temporariamente,
  // outro dispositivo já conhece a fonte e pode tentar sincronizá-la novamente.
  const sync = await syncConfiguredSources({ sourceIds: [source.id] });
  const sourceSummary = (sync.sources || []).find((item) => item.id === source.id) || null;
  return { source, sourcePersisted: true, sourceSummary, sync };
}

