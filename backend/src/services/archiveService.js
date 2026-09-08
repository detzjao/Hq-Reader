import AdmZip from 'adm-zip';
import { createExtractorFromData } from 'node-unrar-js';
import { naturalSort } from '../utils/naturalSort.js';

const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif']);

function extension(name = '') {
  return name.split('.').pop()?.toLowerCase() || '';
}

function isImage(name) {
  return IMAGE_EXTENSIONS.has(extension(name));
}

function assertPageLimits(pageNames) {
  const maxPages = Number(process.env.MAX_ARCHIVE_PAGES || 1000);
  if (pageNames.length > maxPages) {
    const error = new Error(`A HQ excede o limite de ${maxPages} páginas configurado.`);
    error.code = 'TOO_MANY_PAGES';
    error.status = 413;
    throw error;
  }
}

export function listCbzPages(buffer) {
  const zip = new AdmZip(buffer);
  const names = zip
    .getEntries()
    .filter((entry) => !entry.isDirectory && isImage(entry.entryName))
    .map((entry) => entry.entryName)
    .sort(naturalSort);

  assertPageLimits(names);
  return names;
}

export function extractCbzPage(buffer, pageName) {
  const zip = new AdmZip(buffer);
  const entry = zip.getEntry(pageName);
  if (!entry || entry.isDirectory || !isImage(entry.entryName)) return null;

  const maxEntryBytes = Number(process.env.MAX_ARCHIVE_ENTRY_BYTES || 52_428_800);
  const declaredSize = Number(entry.header?.size || 0);
  if (declaredSize > maxEntryBytes) {
    const error = new Error('A página excede o limite de tamanho configurado.');
    error.code = 'PAGE_TOO_LARGE';
    error.status = 413;
    throw error;
  }

  const data = entry.getData();
  if (data.length > maxEntryBytes) {
    const error = new Error('A página excede o limite de tamanho configurado.');
    error.code = 'PAGE_TOO_LARGE';
    error.status = 413;
    throw error;
  }
  return data;
}

async function cbrExtractor(buffer) {
  const data = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  return createExtractorFromData({ data });
}

export async function listCbrPages(buffer) {
  const extractor = await cbrExtractor(buffer);
  const list = extractor.getFileList();
  const headers = [...list.fileHeaders];
  const names = headers
    .filter((header) => !header.flags?.directory && isImage(header.name))
    .map((header) => header.name)
    .sort(naturalSort);

  assertPageLimits(names);
  return names;
}

export async function extractCbrPage(buffer, pageName) {
  const extractor = await cbrExtractor(buffer);
  const extracted = extractor.extract({ files: [pageName] });
  const files = [...extracted.files];
  const file = files.find((item) => item.fileHeader?.name === pageName);
  if (!file?.extraction) return null;

  const data = Buffer.from(file.extraction);
  const maxEntryBytes = Number(process.env.MAX_ARCHIVE_ENTRY_BYTES || 52_428_800);
  if (data.length > maxEntryBytes) {
    const error = new Error('A página excede o limite de tamanho configurado.');
    error.code = 'PAGE_TOO_LARGE';
    error.status = 413;
    throw error;
  }
  return data;
}

export function imageMimeFromName(name) {
  const ext = extension(name);
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'gif') return 'image/gif';
  return 'application/octet-stream';
}
