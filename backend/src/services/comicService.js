import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { getCatalogFile, listCatalogFiles, resolveLocalFilePath } from './catalogService.js';
import { downloadFileBuffer, downloadFileResponse, proxyThumbnail } from './googleDrive.js';
import {
  extractCbzPage,
  extractCbrPage,
  imageMimeFromName,
  listCbzPages,
  listCbrPages
} from './archiveService.js';
import { naturalSortByName } from '../utils/naturalSort.js';

const SUPPORTED_EXTENSIONS = new Set(['pdf', 'jpg', 'jpeg', 'png', 'webp', 'gif', 'cbz', 'cbr']);
const cacheDir = path.join(os.tmpdir(), 'hq-reader-cache');
const pageIndexCache = new Map();

function ext(name = '') {
  return name.split('.').pop()?.toLowerCase() || '';
}

function formatFromFile(file) {
  return ext(file.name);
}

function isSupported(file) {
  return SUPPORTED_EXTENSIONS.has(formatFromFile(file));
}

function publicFile(file) {
  const format = formatFromFile(file);
  return {
    id: file.id,
    name: file.name,
    mimeType: file.mimeType,
    format,
    extension: format.toUpperCase(),
    thumbnailUrl: `/api/comics/${encodeURIComponent(file.id)}/thumbnail`,
    previewUrl: `/api/comics/${encodeURIComponent(file.id)}/content`,
    size: Number(file.size || 0),
    modifiedTime: file.modifiedTime || null,
    path: file.path || '',
    libraryPath: file.path ? `${file.path}/${file.name}` : file.name,
    verified: file.verified !== false,
    category: file.category || (file.path || '').split('/')[0] || 'Outros',
    sourceType: file.sourceType || 'drive',
    downloadUrl: `/api/comics/${encodeURIComponent(file.id)}/download`
  };
}

export async function getComics() {
  const files = await listCatalogFiles();
  return naturalSortByName(files.filter(isSupported)).map(publicFile);
}

export async function getComic(id) {
  const metadata = await getCatalogFile(id);
  if (!isSupported(metadata)) {
    const error = new Error('Formato de HQ não suportado.');
    error.code = 'UNSUPPORTED_FORMAT';
    error.status = 415;
    throw error;
  }
  return publicFile(metadata);
}

async function sourceFile(id) {
  return getCatalogFile(id);
}

async function cacheFile(id) {
  await fs.mkdir(cacheDir, { recursive: true });
  const maxBytes = Number(process.env.MAX_COMIC_BYTES || 524_288_000);
  const cacheTtl = Number(process.env.CACHE_TTL_MS || 3_600_000);
  const key = crypto.createHash('sha256').update(id).digest('hex');
  const filePath = path.join(cacheDir, `${key}.bin`);

  try {
    const stat = await fs.stat(filePath);
    if (Date.now() - stat.mtimeMs < cacheTtl && stat.size <= maxBytes) {
      return fs.readFile(filePath);
    }
  } catch {
    // Cache miss.
  }

  const file = await sourceFile(id);
  let buffer;
  if (file.sourceType === 'local') {
    const localPath = resolveLocalFilePath(file);
    const stat = await fs.stat(localPath);
    if (stat.size > maxBytes) {
      const error = new Error('O arquivo excede o limite de tamanho configurado.');
      error.code = 'FILE_TOO_LARGE';
      error.status = 413;
      throw error;
    }
    buffer = await fs.readFile(localPath);
  } else {
    ({ buffer } = await downloadFileBuffer(file, maxBytes));
  }
  await fs.writeFile(filePath, buffer, { mode: 0o600 });
  return buffer;
}

async function pageIndexForComic(comic) {
  const cached = pageIndexCache.get(comic.id);
  const cacheTtl = Number(process.env.CACHE_TTL_MS || 3_600_000);
  if (cached && Date.now() - cached.createdAt < cacheTtl) return cached;

  const format = comic.format;
  let pageNames = [];
  let pageCount = 1;

  if (format === 'cbz' || format === 'cbr' || format === 'pdf') {
    const buffer = await cacheFile(comic.id);
    try {
      if (format === 'cbz') {
        pageNames = listCbzPages(buffer);
        pageCount = pageNames.length;
      } else if (format === 'cbr') {
        pageNames = await listCbrPages(buffer);
        pageCount = pageNames.length;
      } else {
        const document = await getDocument({ data: new Uint8Array(buffer), disableWorker: true }).promise;
        pageCount = document.numPages;
        await document.destroy();
      }
    } catch (error) {
      if (error.status) throw error;
      const parseError = new Error(`Não foi possível ler o arquivo ${format.toUpperCase()}. Ele pode estar corrompido, criptografado ou usar um recurso incompatível.`);
      parseError.code = 'COMIC_PARSE_FAILED';
      parseError.status = 422;
      throw parseError;
    }
  }

  const index = { createdAt: Date.now(), pageNames, pageCount };
  pageIndexCache.set(comic.id, index);
  return index;
}

export async function getComicPages(id) {
  const comic = await getComic(id);
  const index = await pageIndexForComic(comic);

  if (!index.pageCount) {
    const error = new Error('Esta HQ não contém páginas legíveis.');
    error.code = 'EMPTY_COMIC';
    error.status = 422;
    throw error;
  }

  const pages = Array.from({ length: index.pageCount }, (_, idx) => ({
    page: idx + 1,
    url: comic.format === 'pdf'
      ? `/api/comics/${encodeURIComponent(id)}/content#page=${idx + 1}`
      : `/api/comics/${encodeURIComponent(id)}/pages/${idx + 1}`
  }));

  return {
    comic,
    pageCount: index.pageCount,
    documentUrl: comic.format === 'pdf' ? `/api/comics/${encodeURIComponent(id)}/content` : null,
    pages
  };
}

export async function getPage(id, pageNumber) {
  const comic = await getComic(id);
  const page = Number(pageNumber);
  if (!Number.isInteger(page) || page < 1) {
    const error = new Error('Número de página inválido.');
    error.code = 'INVALID_PAGE';
    error.status = 400;
    throw error;
  }

  if (['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(comic.format)) {
    if (page !== 1) {
      const error = new Error('Página não encontrada.');
      error.code = 'PAGE_NOT_FOUND';
      error.status = 404;
      throw error;
    }
    return { passthrough: true, mimeType: comic.mimeType };
  }

  if (comic.format === 'pdf') {
    const error = new Error('Páginas PDF são renderizadas pelo visualizador PDF.js no frontend.');
    error.code = 'PDF_PAGE_USE_CONTENT';
    error.status = 409;
    throw error;
  }

  const index = await pageIndexForComic(comic);
  const pageName = index.pageNames[page - 1];
  if (!pageName) {
    const error = new Error('Página não encontrada.');
    error.code = 'PAGE_NOT_FOUND';
    error.status = 404;
    throw error;
  }

  const buffer = await cacheFile(id);
  let data;
  try {
    data = comic.format === 'cbz'
      ? extractCbzPage(buffer, pageName)
      : await extractCbrPage(buffer, pageName);
  } catch (error) {
    if (error.status) throw error;
    const extractError = new Error('Não foi possível extrair esta página do arquivo compactado.');
    extractError.code = 'PAGE_EXTRACTION_FAILED';
    extractError.status = 422;
    throw extractError;
  }

  if (!data) {
    const error = new Error('Não foi possível extrair esta página do arquivo.');
    error.code = 'PAGE_EXTRACTION_FAILED';
    error.status = 422;
    throw error;
  }

  return { data, mimeType: imageMimeFromName(pageName), pageName };
}

export async function getContentResponse(id, range) {
  const comic = await getComic(id);
  const file = await sourceFile(id);
  const maxBytes = Number(process.env.MAX_COMIC_BYTES || 524_288_000);
  if (comic.size && comic.size > maxBytes) {
    const error = new Error('O arquivo excede o limite de tamanho configurado.');
    error.code = 'FILE_TOO_LARGE';
    error.status = 413;
    throw error;
  }
  if (comic.format === 'cbz' || comic.format === 'cbr') {
    const error = new Error('Arquivos compactados são servidos página a página.');
    error.code = 'ARCHIVE_CONTENT_NOT_EXPOSED';
    error.status = 409;
    throw error;
  }
  if (file.sourceType === 'local') {
    return {
      type: 'local',
      filePath: resolveLocalFilePath(file),
      mimeType: comic.mimeType,
      size: comic.size,
      range
    };
  }
  return downloadFileResponse(file, { range });
}

export async function getDownloadResponse(id, range) {
  const comic = await getComic(id);
  const file = await sourceFile(id);
  const maxBytes = Number(process.env.MAX_COMIC_BYTES || 524_288_000);
  if (comic.size && comic.size > maxBytes) {
    const error = new Error('O arquivo excede o limite de tamanho configurado.');
    error.code = 'FILE_TOO_LARGE';
    error.status = 413;
    throw error;
  }
  if (file.sourceType === 'local') {
    return {
      comic,
      source: {
        type: 'local',
        filePath: resolveLocalFilePath(file),
        mimeType: comic.mimeType,
        size: comic.size,
        range
      }
    };
  }
  return { comic, source: await downloadFileResponse(file, { range }) };
}

export async function getThumbnailResponse(id) {
  const comic = await getComic(id);
  const file = await sourceFile(id);
  const response = file.sourceType === 'local' ? null : await proxyThumbnail(file);
  if (response) return response;

  if (['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(comic.format)) {
    return getContentResponse(id);
  }

  if (comic.format === 'cbz' || comic.format === 'cbr') {
    const page = await getPage(id, 1);
    return { localData: page.data, mimeType: page.mimeType };
  }

  return null;
}
