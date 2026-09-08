import { put } from '@vercel/blob';
import { extractCbz, extractCbr } from './archive.js';
import { extension } from './formats.js';
import { fetchPublicFile } from './googleDrive.js';
import { getComic, isBlobConfigured, updateComicRevision } from './catalog.js';

async function fileBuffer(file) {
  const maxBytes = Number(process.env.MAX_ARCHIVE_BYTES || 314_572_800);
  let response;
  if (file.sourceType === 'blob' && file.blobUrl) {
    response = await fetch(file.blobUrl, { signal: AbortSignal.timeout(60_000) });
    if (!response.ok) { const e = new Error('Não foi possível baixar o arquivo enviado.'); e.code = 'BLOB_FETCH_FAILED'; e.status = 502; throw e; }
  } else {
    response = await fetchPublicFile(file.id, { resourceKey: file.resourceKey || '', timeout: 60_000 });
  }
  const declared = Number(response.headers.get('content-length') || file.size || 0);
  if (declared && declared > maxBytes) { try { await response.body?.cancel(); } catch {} const e = new Error('O arquivo compactado é grande demais para processamento online.'); e.code = 'ARCHIVE_TOO_LARGE'; e.status = 413; throw e; }
  const chunks = [];
  let total = 0;
  for await (const chunk of response.body || []) {
    total += chunk.byteLength;
    if (total > maxBytes) { const e = new Error('O arquivo compactado é grande demais para processamento online.'); e.code = 'ARCHIVE_TOO_LARGE'; e.status = 413; throw e; }
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks, total);
}

export async function getArchivePages(id) {
  const file = await getComic(id);
  const ext = extension(file.name);
  if (!['cbz', 'cbr'].includes(ext)) { const e = new Error('Esta HQ não é um arquivo CBZ/CBR.'); e.code = 'NOT_ARCHIVE'; e.status = 400; throw e; }
  if (Array.isArray(file.archivePages) && file.archivePages.length) return file.archivePages;
  if (!isBlobConfigured()) { const e = new Error('Conecte o Vercel Blob para abrir arquivos CBZ/CBR.'); e.code = 'BLOB_NOT_CONFIGURED'; e.status = 503; throw e; }

  const buffer = await fileBuffer(file);
  const extracted = ext === 'cbz' ? extractCbz(buffer) : await extractCbr(buffer);
  const pages = [];
  for (let offset = 0; offset < extracted.length; offset += 5) {
    const batch = extracted.slice(offset, offset + 5);
    const uploaded = await Promise.all(batch.map(async (page, index) => {
      const pageNumber = offset + index + 1;
      const pageExt = extension(page.name) || 'jpg';
      const blob = await put(`hq-reader/archive-pages/${encodeURIComponent(id)}/${String(pageNumber).padStart(4, '0')}.${pageExt}`, page.data, {
        access: 'public', addRandomSuffix: false, allowOverwrite: true, contentType: page.mimeType, cacheControlMaxAge: 31536000
      });
      return { page: pageNumber, url: blob.url, mimeType: page.mimeType };
    }));
    pages.push(...uploaded);
  }
  await updateComicRevision(id, { archivePages: pages });
  return pages;
}
