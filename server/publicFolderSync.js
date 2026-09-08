import { publicComic, getCatalog, isBlobConfigured, saveSyncSnapshot } from './catalog.js';
import { mimeForName } from './formats.js';

const SUPPORTED_EXTENSIONS = new Set(['pdf', 'jpg', 'jpeg', 'png', 'webp', 'gif', 'cbz', 'cbr']);

function extension(name = '') {
  return String(name).split('.').pop()?.toLowerCase() || '';
}

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
      const flip = parseFlipEntries(html);
      if (flip.length) return flip;
      const fallback = parseDrivePageFallback(html);
      if (fallback.length) return fallback;
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

async function crawlSource(source) {
  const maxFolders = Number(process.env.PUBLIC_FOLDER_MAX_FOLDERS || 2500);
  const maxFiles = Number(process.env.PUBLIC_FOLDER_MAX_FILES || 25_000);
  const concurrency = Math.max(1, Math.min(8, Number(process.env.PUBLIC_FOLDER_CONCURRENCY || 5)));
  const visitedFolders = new Set();
  const files = new Map();
  let frontier = [{ id: source.id, path: source.category, resourceKey: source.resourceKey || '' }];
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
        for (const item of items) {
          if (item.type === 'folder') {
            if (!visitedFolders.has(item.id)) nextFrontier.push({
              id: item.id,
              resourceKey: item.resourceKey || '',
              path: `${folder.path}/${item.title}`.replace(/\/{2,}/g, '/')
            });
            continue;
          }

          let fileItem = item;
          let ext = extension(fileItem.title);
          if (!SUPPORTED_EXTENSIONS.has(ext)) {
            const target = await resolveShortcutTarget(item);
            if (target?.type === 'folder' && !visitedFolders.has(target.id)) {
              nextFrontier.push({ id: target.id, resourceKey: resourceKeyFromUrl(target.url), path: `${folder.path}/${item.title}`.replace(/\/{2,}/g, '/') });
              continue;
            }
            if (target?.type === 'file') fileItem = { ...item, id: target.id, url: target.url };
            ext = extension(fileItem.title);
          }
          if (!SUPPORTED_EXTENSIONS.has(ext)) continue;

          files.set(fileItem.id, {
            id: fileItem.id,
            name: fileItem.title,
            mimeType: mimeForName(fileItem.title),
            size: 0,
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
    frontier = nextFrontier;
  }

  if (!files.size) {
    const error = new Error(`A fonte “${source.label}” não retornou HQs legíveis.`);
    error.code = 'PUBLIC_FOLDER_EMPTY';
    error.status = 502;
    throw error;
  }

  return { source, files: [...files.values()], folders: visitedFolders.size, failedFolders };
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

export async function syncConfiguredSources() {
  const catalog = await getCatalog({ force: true });
  const sources = (catalog.sources || []).filter((source) => source?.enabled !== false && source?.id && source?.category);
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
      failedFolders: result.value.failedFolders
    });
  });

  const found = [...foundById.values()];
  const added = found.reduce((count, file) => count + (existingIds.has(file.id) ? 0 : 1), 0);
  let persisted = false;
  if (found.length && isBlobConfigured()) {
    try {
      await saveSyncSnapshot(found);
      persisted = true;
    } catch {
      // A varredura continua útil no navegador mesmo se a persistência não estiver disponível.
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
