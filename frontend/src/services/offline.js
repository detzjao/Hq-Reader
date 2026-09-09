const OFFLINE_CACHE = 'hq-reader-offline-v1';
const OFFLINE_INDEX_KEY = 'hq-reader:offline-comics:v1';
const OFFLINE_EVENT = 'hq-reader:offline-updated';

function readIndex() {
  try {
    const parsed = JSON.parse(localStorage.getItem(OFFLINE_INDEX_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch { return {}; }
}

function writeIndex(index) {
  try { localStorage.setItem(OFFLINE_INDEX_KEY, JSON.stringify(index)); } catch {}
}

function emit(detail) {
  try { window.dispatchEvent(new CustomEvent(OFFLINE_EVENT, { detail })); } catch {}
}

export function getOfflineComicIds() {
  return new Set(Object.keys(readIndex()));
}

export function isComicOffline(id) {
  return Boolean(readIndex()[String(id)]);
}

export function getOfflineComicInfo(id) {
  return readIndex()[String(id)] || null;
}

async function cacheResponse(cache, url, response) {
  if (!response?.ok && response?.type !== 'opaque') throw new Error(`Falha ao baixar recurso offline (${response?.status || 0}).`);
  await cache.put(url, response.clone());
}

async function fetchAndCache(cache, url, options = {}) {
  const response = await fetch(url, { ...options, cache: 'no-store' });
  await cacheResponse(cache, url, response);
  return response;
}

export async function saveComicOffline(comic, { onProgress } = {}) {
  if (!('caches' in window)) throw new Error('Este navegador não oferece armazenamento offline compatível.');
  const id = String(comic?.id || '').trim();
  if (!id) throw new Error('HQ inválida.');

  const cache = await caches.open(OFFLINE_CACHE);
  const urls = new Set();
  const report = async (done, total, label) => onProgress?.({ done, total, label });

  const comicUrl = `/api/comic?id=${encodeURIComponent(id)}`;
  await report(0, 1, 'Salvando informações…');
  await fetchAndCache(cache, comicUrl);
  urls.add(comicUrl);

  if (comic.thumbnailUrl) {
    try {
      await fetchAndCache(cache, comic.thumbnailUrl, { mode: 'cors' });
      urls.add(comic.thumbnailUrl);
    } catch {}
  }

  if (comic.format === 'pdf' || comic.format === 'image') {
    const contentUrl = comic.contentUrl || `/api/content?id=${encodeURIComponent(id)}`;
    await report(0, 1, comic.format === 'pdf' ? 'Baixando PDF completo…' : 'Baixando página…');
    await fetchAndCache(cache, contentUrl);
    urls.add(contentUrl);
    await report(1, 1, 'Disponível offline');
  } else if (comic.format === 'cbz' || comic.format === 'cbr') {
    const archiveUrl = `/api/archive?id=${encodeURIComponent(id)}`;
    const archiveResponse = await fetch(archiveUrl, { cache: 'no-store' });
    if (!archiveResponse.ok) throw new Error('Não foi possível preparar as páginas do arquivo compactado.');
    const archiveClone = archiveResponse.clone();
    const archive = await archiveResponse.json();
    await cache.put(archiveUrl, archiveClone);
    urls.add(archiveUrl);

    const pages = Array.isArray(archive.pages) ? archive.pages : [];
    if (!pages.length) throw new Error('A HQ não retornou páginas para uso offline.');
    const concurrency = 4;
    let done = 0;
    for (let offset = 0; offset < pages.length; offset += concurrency) {
      const batch = pages.slice(offset, offset + concurrency);
      await Promise.all(batch.map(async (page) => {
        if (!page?.url) return;
        await fetchAndCache(cache, page.url, { mode: 'cors' });
        urls.add(page.url);
        done += 1;
        await report(done, pages.length, `Salvando páginas ${done}/${pages.length}`);
      }));
    }
  } else {
    throw new Error('Formato não suportado para leitura offline.');
  }

  const index = readIndex();
  index[id] = {
    id,
    name: comic.name || '',
    format: comic.format || '',
    savedAt: new Date().toISOString(),
    urls: [...urls]
  };
  writeIndex(index);
  emit({ id, offline: true });
  return index[id];
}

export async function removeComicOffline(id) {
  const key = String(id || '').trim();
  const index = readIndex();
  const info = index[key];
  if (!info) return false;
  if ('caches' in window) {
    const cache = await caches.open(OFFLINE_CACHE);
    await Promise.all((info.urls || []).map((url) => cache.delete(url).catch(() => false)));
  }
  delete index[key];
  writeIndex(index);
  emit({ id: key, offline: false });
  return true;
}

export const offlineEvents = {
  updated: OFFLINE_EVENT,
  storageKey: OFFLINE_INDEX_KEY,
  cacheName: OFFLINE_CACHE
};
