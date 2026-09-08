import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseGoogleDriveLink, probePublicFile } from './googleDrive.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DATA_DIR = path.resolve(__dirname, '../../data');
const DEFAULT_CATALOG_FILE = path.join(DEFAULT_DATA_DIR, 'library.json');
const DEFAULT_UPLOAD_DIR = path.join(DEFAULT_DATA_DIR, 'uploads');
const SUPPORTED_EXTENSIONS = new Set(['pdf', 'jpg', 'jpeg', 'png', 'webp', 'gif', 'cbz', 'cbr']);

let catalogWriteQueue = Promise.resolve();

const MIME_TO_EXTENSION = new Map([
  ['application/pdf', 'pdf'],
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
  ['image/gif', 'gif'],
  ['application/zip', 'cbz'],
  ['application/x-rar-compressed', 'cbr'],
  ['application/vnd.rar', 'cbr']
]);

function catalogFile() {
  return process.env.LIBRARY_CATALOG_FILE
    ? path.resolve(process.cwd(), process.env.LIBRARY_CATALOG_FILE)
    : DEFAULT_CATALOG_FILE;
}

function dataDir() {
  return path.dirname(catalogFile());
}

export function uploadDir() {
  return process.env.LIBRARY_UPLOAD_DIR
    ? path.resolve(process.cwd(), process.env.LIBRARY_UPLOAD_DIR)
    : path.join(dataDir(), 'uploads');
}

function writeEnabled() {
  return String(process.env.LIBRARY_WRITE_ENABLED ?? 'true').toLowerCase() !== 'false';
}

export function extension(name = '') {
  return name.split('.').pop()?.toLowerCase() || '';
}

export function isSupportedName(name = '') {
  return SUPPORTED_EXTENSIONS.has(extension(name));
}

function extensionForMime(mimeType = '') {
  return MIME_TO_EXTENSION.get(String(mimeType).toLowerCase()) || '';
}

export function mimeForName(name = '') {
  switch (extension(name)) {
    case 'pdf': return 'application/pdf';
    case 'jpg':
    case 'jpeg': return 'image/jpeg';
    case 'png': return 'image/png';
    case 'webp': return 'image/webp';
    case 'gif': return 'image/gif';
    case 'cbz': return 'application/zip';
    case 'cbr': return 'application/vnd.rar';
    default: return 'application/octet-stream';
  }
}

function normalizeCatalog(catalog) {
  return {
    version: Number(catalog?.version || 1),
    updatedAt: catalog?.updatedAt || new Date().toISOString(),
    sourceFolderId: catalog?.sourceFolderId || '',
    sourceFolderUrl: catalog?.sourceFolderUrl || '',
    sources: Array.isArray(catalog?.sources) ? catalog.sources : [],
    files: Array.isArray(catalog?.files) ? catalog.files : []
  };
}

export async function readCatalog() {
  try {
    return normalizeCatalog(JSON.parse(await fs.readFile(catalogFile(), 'utf8')));
  } catch (error) {
    if (error.code === 'ENOENT') return { version: 1, updatedAt: new Date().toISOString(), sources: [], files: [] };
    const wrapped = new Error('O catálogo local da biblioteca está inválido ou não pôde ser lido.');
    wrapped.code = 'CATALOG_READ_FAILED';
    wrapped.status = 500;
    throw wrapped;
  }
}

async function writeCatalogFile(catalog) {
  const target = catalogFile();
  await fs.mkdir(path.dirname(target), { recursive: true });
  const next = { ...normalizeCatalog(catalog), updatedAt: new Date().toISOString() };
  const temp = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  try {
    await fs.writeFile(temp, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
    await fs.rename(temp, target);
    return next;
  } catch (cause) {
    await fs.rm(temp, { force: true }).catch(() => {});
    const error = new Error('Não foi possível salvar as alterações da biblioteca.');
    error.code = 'CATALOG_WRITE_FAILED';
    error.status = 500;
    error.cause = cause;
    throw error;
  }
}

function enqueueCatalogOperation(operation) {
  const queued = catalogWriteQueue.then(operation, operation);
  catalogWriteQueue = queued.catch(() => {});
  return queued;
}

async function assertWriteEnabled() {
  if (!writeEnabled()) {
    const error = new Error('A edição da biblioteca está desativada neste servidor.');
    error.code = 'LIBRARY_WRITE_DISABLED';
    error.status = 403;
    throw error;
  }
}

export async function writeCatalogInternal(catalog) {
  return enqueueCatalogOperation(() => writeCatalogFile(catalog));
}

export async function mutateCatalogInternal(mutator) {
  return enqueueCatalogOperation(async () => {
    const current = await readCatalog();
    const mutation = await mutator(current);
    const nextCatalog = mutation?.catalog || mutation;
    const value = mutation?.value;
    const saved = await writeCatalogFile(nextCatalog);
    return { catalog: saved, value };
  });
}

export async function listCatalogFiles() {
  const catalog = await readCatalog();
  return catalog.files;
}

export async function getCatalogFile(id) {
  const files = await listCatalogFiles();
  const file = files.find((item) => item.id === id);
  if (!file) {
    const error = new Error('HQ não encontrada no catálogo local.');
    error.code = 'COMIC_NOT_FOUND';
    error.status = 404;
    throw error;
  }
  return file;
}

function parseImportLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return null;
  const parts = trimmed.split('|').map((part) => part.trim()).filter(Boolean);
  let label = '';
  let source = trimmed;
  if (parts.length >= 2) {
    const linkPart = parts.find((part) => /drive\.google\.com|drive\.usercontent\.google\.com|docs\.google\.com/i.test(part));
    if (linkPart) {
      source = linkPart;
      label = parts.filter((part) => part !== linkPart).join(' | ');
    }
  }
  let explicitName = '';
  let explicitPath = '';
  if (label) {
    const normalized = label.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
    const slash = normalized.lastIndexOf('/');
    explicitName = slash >= 0 ? normalized.slice(slash + 1).trim() : normalized;
    explicitPath = slash >= 0 ? normalized.slice(0, slash).trim() : '';
  }
  return { source, explicitName, explicitPath };
}

async function importOne(parsedLine) {
  const parsedLink = parseGoogleDriveLink(parsedLine.source);
  if (parsedLine.explicitName) {
    const name = parsedLine.explicitName.trim();
    if (!isSupportedName(name)) {
      const error = new Error(`Formato não suportado para “${name}”. Use PDF, JPG, JPEG, PNG, WEBP, GIF, CBZ ou CBR.`);
      error.code = 'UNSUPPORTED_FORMAT';
      error.status = 415;
      throw error;
    }
    return {
      id: parsedLink.id,
      name,
      mimeType: mimeForName(name),
      size: 0,
      path: parsedLine.explicitPath || '',
      category: parsedLine.explicitPath.split('/')[0] || '',
      sourceType: 'drive',
      sourceUrl: parsedLink.sourceUrl,
      resourceKey: parsedLink.resourceKey || '',
      verified: false,
      addedAt: new Date().toISOString()
    };
  }

  let probed = null;
  try { probed = await probePublicFile(parsedLink); } catch { /* cadastro continua */ }
  let name = probed?.name || '';
  const mimeType = probed?.mimeType || 'application/pdf';
  if (name && !extension(name)) {
    const guessed = extensionForMime(mimeType);
    if (guessed) name = `${name}.${guessed}`;
  }
  if (!name) name = `HQ-${parsedLink.id.slice(-8)}.pdf`;
  if (!isSupportedName(name)) {
    const error = new Error(`Formato não suportado para “${name}”. Use PDF, JPG, JPEG, PNG, WEBP, GIF, CBZ ou CBR.`);
    error.code = 'UNSUPPORTED_FORMAT';
    error.status = 415;
    throw error;
  }
  return {
    id: parsedLink.id,
    name,
    mimeType: mimeType === 'application/octet-stream' ? mimeForName(name) : mimeType,
    size: Number(probed?.size || 0),
    path: parsedLine.explicitPath || '',
    category: parsedLine.explicitPath.split('/')[0] || '',
    sourceType: 'drive',
    sourceUrl: parsedLink.sourceUrl,
    resourceKey: parsedLink.resourceKey || '',
    verified: Boolean(probed?.verified),
    addedAt: new Date().toISOString()
  };
}

export async function addCatalogFile({ sourceUrl, name, path: collectionPath = '' }) {
  if (!writeEnabled()) {
    const error = new Error('A edição da biblioteca está desativada neste servidor.');
    error.code = 'LIBRARY_WRITE_DISABLED';
    error.status = 403;
    throw error;
  }
  const cleanUrl = String(sourceUrl || '').trim();
  const cleanName = String(name || '').trim();
  const cleanPath = String(collectionPath || '').trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  if (!cleanUrl) {
    const error = new Error('Informe o link público do arquivo no Google Drive.');
    error.code = 'URL_REQUIRED';
    error.status = 400;
    throw error;
  }
  const parsedLink = parseGoogleDriveLink(cleanUrl);
  let finalName = cleanName;
  let probe = null;
  if (!finalName) {
    try {
      probe = await probePublicFile(parsedLink);
      finalName = probe?.name || '';
      if (finalName && !extension(finalName)) {
        const guessed = extensionForMime(probe?.mimeType || '');
        if (guessed) finalName = `${finalName}.${guessed}`;
      }
    } catch { /* cadastro continua */ }
    if (!finalName) finalName = `HQ-${parsedLink.id.slice(-8)}.pdf`;
  }
  if (!isSupportedName(finalName)) {
    const error = new Error(`Formato não suportado para “${finalName}”. Use PDF, JPG, JPEG, PNG, WEBP, GIF, CBZ ou CBR.`);
    error.code = 'UNSUPPORTED_FORMAT';
    error.status = 415;
    throw error;
  }
  const { catalog: next, value } = await mutateCatalogInternal((catalog) => {
    const index = catalog.files.findIndex((item) => item.id === parsedLink.id);
    const file = {
      ...(index >= 0 ? catalog.files[index] : {}),
      id: parsedLink.id,
      name: finalName,
      mimeType: probe?.mimeType && probe.mimeType !== 'application/octet-stream' ? probe.mimeType : mimeForName(finalName),
      size: Number(probe?.size || (index >= 0 ? catalog.files[index]?.size || 0 : 0)),
      path: cleanPath,
      category: cleanPath.split('/')[0] || '',
      sourceType: 'drive',
      sourceUrl: parsedLink.sourceUrl,
      resourceKey: parsedLink.resourceKey || '',
      verified: false,
      addedAt: index >= 0 ? (catalog.files[index]?.addedAt || new Date().toISOString()) : new Date().toISOString()
    };
    const files = [...catalog.files];
    if (index >= 0) files[index] = file;
    else files.push(file);
    return { catalog: { ...catalog, files }, value: { file, updated: index >= 0 } };
  });
  return { ...value, total: next.files.length };
}

export async function importCatalogText(text) {
  if (!writeEnabled()) {
    const error = new Error('A edição da biblioteca está desativada neste servidor.');
    error.code = 'LIBRARY_WRITE_DISABLED';
    error.status = 403;
    throw error;
  }
  const lines = String(text || '').split(/\r?\n/).map(parseImportLine).filter(Boolean);
  if (!lines.length) {
    const error = new Error('Cole pelo menos um link de arquivo público do Google Drive.');
    error.code = 'EMPTY_IMPORT';
    error.status = 400;
    throw error;
  }
  if (lines.length > 200) {
    const error = new Error('Importe no máximo 200 links por vez.');
    error.code = 'IMPORT_LIMIT_EXCEEDED';
    error.status = 413;
    throw error;
  }
  const candidates = [];
  const failed = [];
  for (const line of lines) {
    try {
      candidates.push(await importOne(line));
    } catch (error) {
      failed.push({ input: line.source, error: error.message || 'Não foi possível adicionar este link.', code: error.code || 'IMPORT_FAILED' });
    }
  }
  if (!candidates.length) return { added: [], updated: [], failed, total: (await readCatalog()).files.length };

  const { catalog: next, value } = await mutateCatalogInternal((catalog) => {
    const byId = new Map(catalog.files.map((file) => [file.id, file]));
    const added = [];
    const updated = [];
    for (const file of candidates) {
      const existed = byId.has(file.id);
      const merged = { ...(byId.get(file.id) || {}), ...file };
      byId.set(file.id, merged);
      (existed ? updated : added).push(merged);
    }
    return { catalog: { ...catalog, files: [...byId.values()] }, value: { added, updated } };
  });
  return { ...value, failed, total: next.files.length };
}

export async function addLocalCatalogFile({ tempPath, originalName, mimeType, size, path: collectionPath = '' }) {
  if (!writeEnabled()) {
    const error = new Error('A edição da biblioteca está desativada neste servidor.');
    error.code = 'LIBRARY_WRITE_DISABLED';
    error.status = 403;
    throw error;
  }
  const cleanName = path.basename(String(originalName || '').trim());
  const cleanPath = String(collectionPath || '').trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  if (!cleanName || !isSupportedName(cleanName)) {
    const error = new Error('Formato não suportado. Use PDF, JPG, JPEG, PNG, WEBP, GIF, CBZ ou CBR.');
    error.code = 'UNSUPPORTED_FORMAT';
    error.status = 415;
    throw error;
  }
  const maxBytes = Number(process.env.MAX_COMIC_BYTES || 524_288_000);
  if (Number(size || 0) > maxBytes) {
    const error = new Error('O arquivo excede o limite de tamanho configurado.');
    error.code = 'FILE_TOO_LARGE';
    error.status = 413;
    throw error;
  }
  const id = `local-${crypto.randomUUID()}`;
  const ext = extension(cleanName);
  await fs.mkdir(uploadDir(), { recursive: true });
  const finalPath = path.join(uploadDir(), `${id}.${ext}`);
  await fs.rename(tempPath, finalPath);
  const relativeLocalPath = path.relative(dataDir(), finalPath).replace(/\\/g, '/');
  const file = {
    id,
    name: cleanName,
    mimeType: mimeType && mimeType !== 'application/octet-stream' ? mimeType : mimeForName(cleanName),
    size: Number(size || 0),
    path: cleanPath,
    category: cleanPath.split('/')[0] || '',
    sourceType: 'local',
    localPath: relativeLocalPath,
    verified: true,
    addedAt: new Date().toISOString()
  };
  try {
    const { catalog: next } = await mutateCatalogInternal((catalog) => ({ ...catalog, files: [...catalog.files, file] }));
    return { file, total: next.files.length };
  } catch (error) {
    await fs.rm(finalPath, { force: true }).catch(() => {});
    throw error;
  }
}

export function resolveLocalFilePath(file) {
  if (file?.sourceType !== 'local' || !file?.localPath) return '';
  const base = path.resolve(dataDir());
  const target = path.resolve(base, file.localPath);
  if (!(target === base || target.startsWith(`${base}${path.sep}`))) {
    const error = new Error('Caminho local inválido no catálogo.');
    error.code = 'INVALID_LOCAL_PATH';
    error.status = 500;
    throw error;
  }
  return target;
}

export async function removeCatalogFile(id) {
  await assertWriteEnabled();
  const { catalog: next, value: existing } = await mutateCatalogInternal((catalog) => {
    const existing = catalog.files.find((file) => file.id === id);
    if (!existing) {
      const error = new Error('HQ não encontrada no catálogo.');
      error.code = 'COMIC_NOT_FOUND';
      error.status = 404;
      throw error;
    }
    return { catalog: { ...catalog, files: catalog.files.filter((file) => file.id !== id) }, value: existing };
  });
  if (existing.sourceType === 'local') {
    const localPath = resolveLocalFilePath(existing);
    if (localPath) await fs.rm(localPath, { force: true }).catch(() => {});
  }
  return { ok: true, total: next.files.length };
}

export async function libraryStatus() {
  const catalog = await readCatalog();
  return {
    mode: 'public-catalog',
    credentialsRequired: false,
    writeEnabled: writeEnabled(),
    uploadEnabled: writeEnabled(),
    catalogFile: path.basename(catalogFile()),
    sources: catalog.sources || []
  };
}
