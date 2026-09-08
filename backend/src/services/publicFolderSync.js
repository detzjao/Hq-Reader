import { readCatalog, mutateCatalogInternal } from './catalogService.js';

const SUPPORTED_EXTENSIONS = new Set(['pdf', 'jpg', 'jpeg', 'png', 'webp', 'gif', 'cbz', 'cbr']);
const MIME_BY_EXTENSION = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  cbz: 'application/zip',
  cbr: 'application/vnd.rar'
};

let activeSync = null;
let lastSyncAt = 0;
let lastSummary = null;

function extension(name = '') {
  return String(name).split('.').pop()?.toLowerCase() || '';
}

function stripTags(value = '') {
  return value.replace(/<[^>]*>/g, ' ');
}

function decodeHtml(value = '') {
  return stripTags(value)
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
  const value = decodeHtml(String(url));
  const match = value.match(/\/folders\/([A-Za-z0-9_-]{10,})/i)
    || value.match(/[?&]id=([A-Za-z0-9_-]{10,})/i);
  return match?.[1] || '';
}

function fileIdFromUrl(url = '') {
  const value = decodeHtml(String(url));
  const match = value.match(/\/file\/d\/([A-Za-z0-9_-]{10,})/i)
    || value.match(/\/d\/([A-Za-z0-9_-]{10,})/i)
    || value.match(/[?&]id=([A-Za-z0-9_-]{10,})/i);
  return match?.[1] || '';
}

function resourceKeyFromUrl(url = '') {
  try {
    const parsed = new URL(decodeHtml(url));
    return parsed.searchParams.get('resourcekey') || parsed.searchParams.get('resourceKey') || '';
  } catch {
    const match = decodeHtml(url).match(/[?&]resourcekey=([^&#]+)/i);
    return match?.[1] ? decodeURIComponent(match[1]) : '';
  }
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

  // O HTML normal do Drive costuma conter URLs de arquivos/pastas e seus nomes
  // em blocos serializados. Esse fallback aceita as duas ordens mais comuns.
  const urlThenTitle = /(https:\/\/drive\.google\.com\/(?:file\/d\/|drive\/folders\/)[A-Za-z0-9_?&=\-./%]+)[\s\S]{0,1200}?["']([^"'<>]{1,220}\.(?:pdf|cbz|cbr|jpe?g|png|webp|gif))["']/gi;
  let match;
  while ((match = urlThenTitle.exec(normalized))) {
    const href = decodeHtml(match[1]);
    const title = decodeHtml(match[2]);
    const folderId = folderIdFromUrl(href);
    const fileId = fileIdFromUrl(href);
    const item = folderId
      ? { type: 'folder', id: folderId, title: title.replace(/\.(pdf|cbz|cbr|jpe?g|png|webp|gif)$/i, ''), url: href, resourceKey: resourceKeyFromUrl(href) }
      : fileId
        ? { type: 'file', id: fileId, title, url: href, resourceKey: resourceKeyFromUrl(href) }
        : null;
    if (item) items.set(`${item.type}:${item.id}`, item);
  }

  // Procura URLs explícitas mesmo quando o título aparece separado. Para arquivos
  // sem nome confiável, a etapa seguinte tenta descobrir o nome pelo download.
  const urls = normalized.match(/https:\/\/drive\.google\.com\/(?:file\/d\/[A-Za-z0-9_-]{10,}[^"'<>\s]*|drive\/folders\/[A-Za-z0-9_-]{10,}[^"'<>\s]*)/gi) || [];
  for (const hrefRaw of urls) {
    const href = decodeHtml(hrefRaw);
    const folderId = folderIdFromUrl(href);
    const fileId = fileIdFromUrl(href);
    if (folderId) items.set(`folder:${folderId}`, { type: 'folder', id: folderId, title: `Pasta ${folderId.slice(-6)}`, url: href, resourceKey: resourceKeyFromUrl(href) });
    else if (fileId) items.set(`file:${fileId}`, { type: 'file', id: fileId, title: `HQ-${fileId.slice(-8)}.pdf`, url: href, resourceKey: resourceKeyFromUrl(href) });
  }
  return [...items.values()];
}

async function fetchFolderItems(folderId, resourceKey = '') {
  let lastStatus = 0;
  let lastHtml = '';
  for (const candidate of folderViewCandidates(folderId, resourceKey)) {
    let response;
    try {
      response = await fetch(candidate, {
        redirect: 'follow',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/152 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.7'
        },
        signal: AbortSignal.timeout(Number(process.env.PUBLIC_FOLDER_TIMEOUT_MS || 25_000))
      });
    } catch {
      continue;
    }
    lastStatus = response.status;
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      continue;
    }
    const html = await response.text();
    lastHtml = html;
    if (/ServiceLogin|accounts\.google\.com\/signin/i.test(html)) continue;

    const flipItems = parseFlipEntries(html);
    if (flipItems.length) return flipItems;
    const fallback = parseDrivePageFallback(html);
    if (fallback.length) return fallback;
  }

  if (/ServiceLogin|accounts\.google\.com\/signin/i.test(lastHtml)) {
    const error = new Error('Uma das pastas configuradas não está disponível publicamente.');
    error.code = 'PUBLIC_FOLDER_NOT_PUBLIC';
    error.status = 403;
    throw error;
  }
  const error = new Error(lastStatus ? `Não foi possível ler a pasta pública (HTTP ${lastStatus}).` : 'Não foi possível acessar uma das pastas públicas da biblioteca.');
  error.code = 'PUBLIC_FOLDER_UNAVAILABLE';
  error.status = 502;
  throw error;
}

async function resolveShortcutTarget(item) {
  const candidates = [
    `https://drive.google.com/open?id=${encodeURIComponent(item.id)}`,
    `https://drive.google.com/file/d/${encodeURIComponent(item.id)}/view`,
  ];
  for (const candidate of candidates) {
    try {
      const response = await fetch(candidate, {
        redirect: 'follow',
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/152 Safari/537.36' },
        signal: AbortSignal.timeout(Number(process.env.PUBLIC_FOLDER_TIMEOUT_MS || 20_000))
      });
      const finalUrl = response.url || '';
      const html = (response.headers.get('content-type') || '').includes('text/html') ? await response.text() : '';
      const candidatesText = `${finalUrl} ${decodeHtml(html)}`;
      const folderMatch = candidatesText.match(/https:\/\/drive\.google\.com\/drive\/folders\/([A-Za-z0-9_-]{10,})/i);
      if (folderMatch?.[1] && folderMatch[1] !== item.id) return { type: 'folder', id: folderMatch[1], url: folderMatch[0] };
      const fileMatch = candidatesText.match(/https:\/\/drive\.google\.com\/file\/d\/([A-Za-z0-9_-]{10,})/i);
      if (fileMatch?.[1] && fileMatch[1] !== item.id) return { type: 'file', id: fileMatch[1], url: fileMatch[0] };
    } catch {
      // tenta o próximo formato
    }
  }
  return null;
}

async function crawlSource(source) {
  const maxFolders = Number(process.env.PUBLIC_FOLDER_MAX_FOLDERS || 2000);
  const maxFiles = Number(process.env.PUBLIC_FOLDER_MAX_FILES || 20_000);
  const concurrency = Math.max(1, Math.min(8, Number(process.env.PUBLIC_FOLDER_CONCURRENCY || 4)));
  const visitedFolders = new Set();
  const files = new Map();
  let frontier = [{ id: source.id, path: source.category, resourceKey: source.resourceKey || '' }];

  while (frontier.length) {
    const nextFrontier = [];
    for (let offset = 0; offset < frontier.length; offset += concurrency) {
      const batch = frontier.slice(offset, offset + concurrency).filter((folder) => !visitedFolders.has(folder.id));
      batch.forEach((folder) => visitedFolders.add(folder.id));
      if (!batch.length) continue;
      if (visitedFolders.size > maxFolders) {
        const error = new Error(`A fonte “${source.label}” excedeu o limite de pastas configurado.`);
        error.code = 'PUBLIC_FOLDER_LIMIT';
        error.status = 413;
        throw error;
      }

      const results = await Promise.allSettled(batch.map(async (folder) => ({
        folder,
        items: await fetchFolderItems(folder.id, folder.resourceKey)
      })));

      for (const result of results) {
        if (result.status === 'rejected') continue;
        const { folder, items } = result.value;
        for (const item of items) {
          if (item.type === 'folder') {
            if (!visitedFolders.has(item.id)) {
              nextFrontier.push({
                id: item.id,
                resourceKey: item.resourceKey || '',
                path: `${folder.path}/${item.title}`.replace(/\/+/g, '/')
              });
            }
            continue;
          }

          let fileItem = item;
          let ext = extension(fileItem.title);
          if (!SUPPORTED_EXTENSIONS.has(ext)) {
            const target = await resolveShortcutTarget(item);
            if (target?.type === 'folder' && !visitedFolders.has(target.id)) {
              nextFrontier.push({ id: target.id, resourceKey: resourceKeyFromUrl(target.url), path: `${folder.path}/${item.title}` });
              continue;
            }
            if (target?.type === 'file') fileItem = { ...item, id: target.id, url: target.url };
            ext = extension(fileItem.title);
          }
          if (!SUPPORTED_EXTENSIONS.has(ext)) continue;
          files.set(fileItem.id, {
            id: fileItem.id,
            name: fileItem.title,
            mimeType: MIME_BY_EXTENSION[ext] || 'application/octet-stream',
            size: 0,
            path: folder.path,
            category: source.category,
            sourceType: 'drive',
            sourceFolderId: source.id,
            sourceUrl: fileItem.url,
            resourceKey: fileItem.resourceKey || resourceKeyFromUrl(fileItem.url),
            verified: false,
            syncedAt: new Date().toISOString()
          });
          if (files.size > maxFiles) {
            const error = new Error(`A fonte “${source.label}” excedeu o limite de arquivos configurado.`);
            error.code = 'PUBLIC_FOLDER_LIMIT';
            error.status = 413;
            throw error;
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

  return { source, files: [...files.values()], folders: visitedFolders.size };
}

export async function syncConfiguredSources({ force = false } = {}) {
  const cooldown = Number(process.env.PUBLIC_FOLDER_SYNC_COOLDOWN_MS || 600_000);
  if (activeSync) return activeSync;
  if (!force && lastSummary && Date.now() - lastSyncAt < cooldown) return lastSummary;

  activeSync = (async () => {
    const catalog = await readCatalog();
    const sources = (catalog.sources || []).filter((source) => source?.enabled !== false && source?.id && source?.category);
    if (!sources.length) {
      const summary = { ok: true, sources: [], added: 0, updated: 0, total: catalog.files.length };
      lastSummary = summary;
      lastSyncAt = Date.now();
      return summary;
    }

    const results = await Promise.allSettled(sources.map(crawlSource));
    const byId = new Map(catalog.files.map((file) => [file.id, file]));
    let added = 0;
    let updated = 0;
    const sourceSummaries = [];

    for (let index = 0; index < results.length; index += 1) {
      const result = results[index];
      const source = sources[index];
      if (result.status === 'rejected') {
        sourceSummaries.push({ id: source.id, label: source.label, category: source.category, ok: false, error: result.reason?.message || 'Falha ao atualizar a fonte.' });
        continue;
      }

      for (const file of result.value.files) {
        const existed = byId.has(file.id);
        const previous = byId.get(file.id) || {};
        byId.set(file.id, { ...previous, ...file, size: Number(previous.size || file.size || 0), addedAt: previous.addedAt || new Date().toISOString() });
        if (existed) updated += 1;
        else added += 1;
      }
      sourceSummaries.push({ id: source.id, label: source.label, category: source.category, ok: true, files: result.value.files.length, folders: result.value.folders });
    }

    // Salva como mutação atômica para não perder uploads/importações realizados
    // enquanto a varredura das pastas públicas estava em andamento.
    const { catalog: next } = await mutateCatalogInternal((latestCatalog) => {
      const latestById = new Map(latestCatalog.files.map((file) => [file.id, file]));
      for (const result of results) {
        if (result.status !== 'fulfilled') continue;
        for (const file of result.value.files) {
          const previous = latestById.get(file.id) || {};
          latestById.set(file.id, {
            ...previous,
            ...file,
            size: Number(previous.size || file.size || 0),
            addedAt: previous.addedAt || new Date().toISOString()
          });
        }
      }
      return { ...latestCatalog, files: [...latestById.values()] };
    });
    const successful = sourceSummaries.filter((source) => source.ok).length;
    const summary = { ok: successful > 0, partial: successful > 0 && successful < sourceSummaries.length, sources: sourceSummaries, added, updated, total: next.files.length };
    lastSummary = summary;
    lastSyncAt = Date.now();
    return summary;
  })();

  try {
    return await activeSync;
  } finally {
    activeSync = null;
  }
}

export function getPublicFolderSyncState() {
  return { syncing: Boolean(activeSync), lastSyncAt: lastSyncAt ? new Date(lastSyncAt).toISOString() : null, lastSummary };
}
