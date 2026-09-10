import { put } from '@vercel/blob';
import { createCbzReader, createCbrReader } from './archive.js';
import { extension } from './formats.js';
import { fetchPublicFile } from './googleDrive.js';
import { isBlobConfigured, updateComicRevision } from './catalog.js';
import { getUnifiedComic } from './catalogV2.js';
import { hasSupabaseWrite } from './supabase.js';
import {
  beginArchiveCache,
  finishArchiveCache,
  markArchiveCacheFailed,
  readStoredArchivePages,
  uploadArchivePage
} from './supabaseStore.js';

async function fileBuffer(file) {
  const maxBytes = Number(process.env.MAX_ARCHIVE_BYTES || 314_572_800);
  let response;
  if (file.sourceType === 'blob' && file.blobUrl) {
    response = await fetch(file.blobUrl, { signal: AbortSignal.timeout(90_000) });
    if (!response.ok) {
      const e = new Error('Não foi possível baixar o arquivo enviado.');
      e.code = 'BLOB_FETCH_FAILED';
      e.status = 502;
      throw e;
    }
  } else {
    response = await fetchPublicFile(file.id, { resourceKey: file.resourceKey || '', timeout: 90_000 });
  }
  const declared = Number(response.headers.get('content-length') || file.size || 0);
  if (declared && declared > maxBytes) {
    try { await response.body?.cancel(); } catch {}
    const e = new Error('O arquivo compactado é grande demais para processamento online.');
    e.code = 'ARCHIVE_TOO_LARGE';
    e.status = 413;
    throw e;
  }
  const chunks = [];
  let total = 0;
  for await (const chunk of response.body || []) {
    total += chunk.byteLength;
    if (total > maxBytes) {
      const e = new Error('O arquivo compactado é grande demais para processamento online.');
      e.code = 'ARCHIVE_TOO_LARGE';
      e.status = 413;
      throw e;
    }
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks, total);
}

async function processArchiveIntoSupabase(file, ext) {
  const cached = await readStoredArchivePages(file.id);
  if (cached.length) return cached;

  await beginArchiveCache(file.id, ext);
  try {
    const buffer = await fileBuffer(file);
    const reader = ext === 'cbz' ? createCbzReader(buffer) : await createCbrReader(buffer);
    if (!reader.count) {
      const e = new Error('O arquivo compactado não possui imagens legíveis.');
      e.code = 'ARCHIVE_EMPTY';
      e.status = 422;
      throw e;
    }

    const pages = [];
    // Pequenos lotes equilibram RAM e tempo de rede: no máximo quatro páginas
    // ficam descompactadas ao mesmo tempo, mas os uploads rodam em paralelo.
    const batchSize = Math.max(1, Math.min(6, Number(process.env.ARCHIVE_PAGE_UPLOAD_CONCURRENCY || 4)));
    for (let offset = 0; offset < reader.pages.length; offset += batchSize) {
      const descriptors = reader.pages.slice(offset, offset + batchSize);
      const extracted = descriptors
        .map((descriptor) => ({ descriptor, page: reader.extract(descriptor) }))
        .filter((item) => item.page?.data?.length);
      const uploaded = await Promise.all(extracted.map(({ descriptor, page }) =>
        uploadArchivePage(file.id, descriptor.index, page)
      ));
      pages.push(...uploaded);
    }

    if (pages.length !== reader.count) {
      const e = new Error(`Foram extraídas ${pages.length} de ${reader.count} páginas do arquivo.`);
      e.code = 'ARCHIVE_PARTIAL_EXTRACTION';
      e.status = 502;
      throw e;
    }

    await finishArchiveCache(file.id, pages);
    return pages;
  } catch (error) {
    await markArchiveCacheFailed(file.id, error?.message || 'Falha ao processar arquivo compactado.').catch(() => {});
    throw error;
  }
}

async function processArchiveIntoVercelBlob(file, ext, persist) {
  if (Array.isArray(file.archivePages) && file.archivePages.length) return file.archivePages;
  if (!isBlobConfigured()) {
    const e = new Error('O armazenamento de páginas compactadas não está disponível.');
    e.code = 'ARCHIVE_STORAGE_NOT_CONFIGURED';
    e.status = 503;
    throw e;
  }

  const buffer = await fileBuffer(file);
  const reader = ext === 'cbz' ? createCbzReader(buffer) : await createCbrReader(buffer);
  const pages = [];
  const batchSize = Math.max(1, Math.min(6, Number(process.env.ARCHIVE_PAGE_UPLOAD_CONCURRENCY || 4)));
  for (let offset = 0; offset < reader.pages.length; offset += batchSize) {
    const descriptors = reader.pages.slice(offset, offset + batchSize);
    const extracted = descriptors
      .map((descriptor) => ({ descriptor, page: reader.extract(descriptor) }))
      .filter((item) => item.page?.data?.length);
    const uploaded = await Promise.all(extracted.map(async ({ descriptor, page }) => {
      const pageExt = extension(page.name) || 'jpg';
      const blob = await put(`hq-reader/archive-pages/${encodeURIComponent(file.id)}/${String(descriptor.index).padStart(4, '0')}.${pageExt}`, page.data, {
        access: 'public',
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: page.mimeType,
        cacheControlMaxAge: 31536000
      });
      return { page: descriptor.index, url: blob.url, mimeType: page.mimeType };
    }));
    pages.push(...uploaded);
  }
  if (persist) await updateComicRevision(file.id, { archivePages: pages, pageCount: pages.length });
  return pages;
}

export async function getArchivePagesForFile(file, { persist = false } = {}) {
  const ext = extension(file.name);
  if (!['cbz', 'cbr'].includes(ext)) {
    const e = new Error('Esta HQ não é um arquivo CBZ/CBR.');
    e.code = 'NOT_ARCHIVE';
    e.status = 400;
    throw e;
  }

  // Supabase é o cache principal da 2.4.2. Depois da primeira abertura, a
  // Function não precisa baixar nem extrair novamente o CBZ/CBR.
  if (hasSupabaseWrite()) {
    return processArchiveIntoSupabase(file, ext);
  }

  // Fallback de transição para instalações que ainda usam Vercel Blob.
  return processArchiveIntoVercelBlob(file, ext, persist);
}

export async function getArchivePages(id) {
  const file = await getUnifiedComic(id);
  return getArchivePagesForFile(file, { persist: true });
}
