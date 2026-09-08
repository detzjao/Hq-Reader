import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { del, list, put } from '@vercel/blob';
import { isAdminConfigured } from './auth.js';
import { driveThumbnailUrl, parseGoogleDriveLink, probePublicFile } from './googleDrive.js';
import { extension, formatForName, isSupportedName, mimeForName } from './formats.js';
import { naturalSort } from './naturalSort.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INITIAL_PATH = path.resolve(__dirname, '../data/initial-library.json');
const REVISION_PREFIX = 'hq-reader/catalog-revisions/';
const SYNC_SNAPSHOT_PREFIX = 'hq-reader/sync-snapshots/';
let seedPromise = null;
let dynamicCache = { at: 0, files: null };
let syncSnapshotCache = { at: 0, files: null };

export function isBlobConfigured() {
  return Boolean(String(process.env.BLOB_READ_WRITE_TOKEN || '').trim());
}

async function seed() {
  if (!seedPromise) {
    seedPromise = fs.readFile(INITIAL_PATH, 'utf8').then((raw) => {
      const parsed = JSON.parse(raw);
      return {
        version: parsed.version || 1,
        updatedAt: parsed.updatedAt || null,
        sources: Array.isArray(parsed.sources) ? parsed.sources : [],
        files: Array.isArray(parsed.files) ? parsed.files : []
      };
    });
  }
  return seedPromise;
}

async function listAllBlobs(prefix) {
  const blobs = [];
  let cursor;
  do {
    const page = await list({ prefix, limit: 1000, ...(cursor ? { cursor } : {}) });
    blobs.push(...(page.blobs || []));
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return blobs;
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`Falha ao ler metadado (${response.status}).`);
  return response.json();
}

async function dynamicRevisions({ force = false } = {}) {
  if (!isBlobConfigured()) return [];
  const ttl = Number(process.env.CATALOG_CACHE_MS || 20_000);
  if (!force && dynamicCache.files && Date.now() - dynamicCache.at < ttl) return dynamicCache.files;
  const blobs = await listAllBlobs(REVISION_PREFIX);
  const revisions = [];
  for (let offset = 0; offset < blobs.length; offset += 20) {
    const batch = blobs.slice(offset, offset + 20);
    const values = await Promise.allSettled(batch.map((blob) => fetchJson(blob.url)));
    for (const value of values) if (value.status === 'fulfilled' && value.value?.id) revisions.push(value.value);
  }
  dynamicCache = { at: Date.now(), files: revisions };
  return revisions;
}


async function latestSyncSnapshot({ force = false } = {}) {
  if (!isBlobConfigured()) return [];
  const ttl = Number(process.env.CATALOG_CACHE_MS || 20_000);
  if (!force && syncSnapshotCache.files && Date.now() - syncSnapshotCache.at < ttl) return syncSnapshotCache.files;
  const blobs = await listAllBlobs(SYNC_SNAPSHOT_PREFIX);
  if (!blobs.length) {
    syncSnapshotCache = { at: Date.now(), files: [] };
    return [];
  }
  const latest = [...blobs].sort((a, b) => {
    const at = Date.parse(a.uploadedAt || 0) || Number(String(a.pathname || '').match(/(\d{13})/)?.[1] || 0);
    const bt = Date.parse(b.uploadedAt || 0) || Number(String(b.pathname || '').match(/(\d{13})/)?.[1] || 0);
    return bt - at;
  })[0];
  try {
    const value = await fetchJson(latest.url);
    const files = Array.isArray(value?.files) ? value.files : [];
    syncSnapshotCache = { at: Date.now(), files };
    return files;
  } catch {
    syncSnapshotCache = { at: Date.now(), files: [] };
    return [];
  }
}

export async function saveSyncSnapshot(files) {
  if (!isBlobConfigured()) return false;
  const unique = [...new Map((files || []).filter((file) => file?.id).map((file) => [file.id, file])).values()];
  const payload = { syncedAt: new Date().toISOString(), files: unique };
  const pathname = `${SYNC_SNAPSHOT_PREFIX}${Date.now()}-${crypto.randomUUID()}.json`;
  await put(pathname, JSON.stringify(payload), {
    access: 'public',
    addRandomSuffix: false,
    contentType: 'application/json',
    cacheControlMaxAge: 31536000
  });
  syncSnapshotCache = { at: Date.now(), files: unique };
  return true;
}

function latestRevisionById(revisions) {
  const latest = new Map();
  for (const revision of revisions) {
    const previous = latest.get(revision.id);
    const currentTime = Date.parse(revision._revisionAt || revision.updatedAt || 0) || 0;
    const previousTime = Date.parse(previous?._revisionAt || previous?.updatedAt || 0) || 0;
    if (!previous || currentTime >= previousTime) latest.set(revision.id, revision);
  }
  return latest;
}

function normalizedCategory(file) {
  return file.category || String(file.path || '').split('/')[0] || 'Outros';
}

export function publicComic(file) {
  const ext = extension(file.name);
  const format = formatForName(file.name);
  let thumbnailUrl = file.thumbnailUrl || '';
  if (!thumbnailUrl && file.sourceType === 'drive') thumbnailUrl = driveThumbnailUrl(file, 500);
  if (!thumbnailUrl && file.sourceType === 'blob' && format === 'image') thumbnailUrl = file.blobUrl || '';
  const contentUrl = file.sourceType === 'blob' && file.blobUrl ? file.blobUrl : `/api/content?id=${encodeURIComponent(file.id)}`;
  return {
    id: file.id,
    name: file.name,
    mimeType: file.mimeType || mimeForName(file.name),
    size: Number(file.size || 0),
    path: file.path || '',
    category: normalizedCategory(file),
    sourceType: file.sourceType || 'drive',
    extension: ext,
    format,
    thumbnailUrl,
    contentUrl,
    addedAt: file.addedAt || null
  };
}

export async function getCatalog({ force = false } = {}) {
  const base = await seed();
  const byId = new Map(base.files.map((file) => [file.id, { ...file, category: normalizedCategory(file) }]));
  const syncedFiles = await latestSyncSnapshot({ force });
  for (const file of syncedFiles) {
    if (!file?.id) continue;
    const previous = byId.get(file.id) || {};
    byId.set(file.id, { ...previous, ...file, category: normalizedCategory(file) });
  }
  const latest = latestRevisionById(await dynamicRevisions({ force }));
  for (const [id, revision] of latest) {
    if (revision.deleted) byId.delete(id);
    else byId.set(id, { ...(byId.get(id) || {}), ...revision, category: normalizedCategory(revision) });
  }
  const categoryRank = new Map([['Marvel', 0], ['DC Comics', 1], ['Turma da Mônica', 2], ['Outros', 99]]);
  const files = [...byId.values()].sort((a, b) => {
    const ar = categoryRank.get(normalizedCategory(a)) ?? 50;
    const br = categoryRank.get(normalizedCategory(b)) ?? 50;
    return ar - br || naturalSort(`${a.path || ''}/${a.name}`, `${b.path || ''}/${b.name}`);
  });
  return { version: base.version, updatedAt: base.updatedAt, sources: base.sources, files };
}

export async function getComic(id) {
  const catalog = await getCatalog();
  const file = catalog.files.find((item) => item.id === id);
  if (!file) { const e = new Error('HQ não encontrada.'); e.code = 'COMIC_NOT_FOUND'; e.status = 404; throw e; }
  return file;
}

export async function writeRevision(file) {
  if (!isBlobConfigured()) { const e = new Error('Conecte um Vercel Blob ao projeto para salvar alterações.'); e.code = 'BLOB_NOT_CONFIGURED'; e.status = 503; throw e; }
  const revision = { ...file, _revisionAt: new Date().toISOString() };
  const pathname = `${REVISION_PREFIX}${encodeURIComponent(file.id)}/${Date.now()}-${crypto.randomUUID()}.json`;
  await put(pathname, JSON.stringify(revision), { access: 'public', addRandomSuffix: false, contentType: 'application/json', cacheControlMaxAge: 31536000 });
  dynamicCache = { at: 0, files: null };
  syncSnapshotCache = { at: 0, files: null };
  return revision;
}

function cleanPath(value = '') { return String(value).trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').replace(/\/{2,}/g, '/'); }

function parseImportLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return null;
  const parts = trimmed.split('|').map((part) => part.trim()).filter(Boolean);
  let source = trimmed;
  let label = '';
  if (parts.length >= 2) {
    const link = parts.find((part) => /drive\.google\.com|drive\.usercontent\.google\.com|docs\.google\.com/i.test(part));
    if (link) { source = link; label = parts.filter((part) => part !== link).join(' | '); }
  }
  let name = '';
  let collectionPath = '';
  if (label) {
    const normalized = cleanPath(label);
    const slash = normalized.lastIndexOf('/');
    name = slash >= 0 ? normalized.slice(slash + 1) : normalized;
    collectionPath = slash >= 0 ? normalized.slice(0, slash) : '';
  }
  return { source, name, path: collectionPath };
}

export async function addDriveComic({ url, name = '', path: collectionPath = '' }) {
  const parsed = parseGoogleDriveLink(url);
  let probe = null;
  try { probe = await probePublicFile(parsed); } catch {}
  let finalName = String(name || '').trim() || probe?.name || `HQ-${parsed.id.slice(-8)}.pdf`;
  if (!extension(finalName) && probe?.mimeType) {
    const byMime = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };
    if (byMime[probe.mimeType]) finalName += `.${byMime[probe.mimeType]}`;
  }
  if (!isSupportedName(finalName)) { const e = new Error('Formato não suportado. Use PDF, CBZ, CBR, JPG, PNG, WEBP ou GIF.'); e.code = 'UNSUPPORTED_FORMAT'; e.status = 415; throw e; }
  const clean = cleanPath(collectionPath);
  const existing = await getCatalog().then((catalog) => catalog.files.find((item) => item.id === parsed.id));
  const file = {
    ...(existing || {}), id: parsed.id, name: finalName,
    mimeType: probe?.mimeType && probe.mimeType !== 'application/octet-stream' ? probe.mimeType : mimeForName(finalName),
    size: Number(probe?.size || existing?.size || 0), path: clean, category: clean.split('/')[0] || existing?.category || 'Outros',
    sourceType: 'drive', sourceUrl: parsed.sourceUrl, resourceKey: parsed.resourceKey || '',
    addedAt: existing?.addedAt || new Date().toISOString(), deleted: false
  };
  await writeRevision(file);
  return publicComic(file);
}

export async function importDriveLinks(text) {
  const lines = String(text || '').split(/\r?\n/).map(parseImportLine).filter(Boolean);
  if (!lines.length) { const e = new Error('Cole pelo menos um link de HQ.'); e.code = 'EMPTY_IMPORT'; e.status = 400; throw e; }
  if (lines.length > 200) { const e = new Error('Importe no máximo 200 links por vez.'); e.code = 'IMPORT_LIMIT'; e.status = 413; throw e; }
  const added = [], failed = [];
  for (let offset = 0; offset < lines.length; offset += 4) {
    const batch = lines.slice(offset, offset + 4);
    const results = await Promise.allSettled(batch.map((line) => addDriveComic({ url: line.source, name: line.name, path: line.path })));
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') added.push(result.value);
      else failed.push({ input: batch[index].source, error: result.reason?.message || 'Falha ao importar.' });
    });
  }
  return { added, failed, total: (await getCatalog({ force: true })).files.length };
}

export async function addBlobComic({ blob, originalName, size = 0, path: collectionPath = '', thumbnailUrl = '' }) {
  if (!blob?.url) { const e = new Error('Upload inválido.'); e.code = 'INVALID_BLOB'; e.status = 400; throw e; }
  const name = path.basename(String(originalName || blob.pathname || 'HQ').trim());
  if (!isSupportedName(name)) { const e = new Error('Formato não suportado.'); e.code = 'UNSUPPORTED_FORMAT'; e.status = 415; throw e; }
  const clean = cleanPath(collectionPath);
  const file = {
    id: `blob-${crypto.randomUUID()}`,
    name,
    mimeType: blob.contentType || mimeForName(name),
    size: Number(size || 0),
    path: clean,
    category: clean.split('/')[0] || 'Outros',
    sourceType: 'blob',
    blobUrl: blob.url,
    downloadUrl: blob.downloadUrl || blob.url,
    blobPathname: blob.pathname || '',
    thumbnailUrl: thumbnailUrl || '',
    addedAt: new Date().toISOString(),
    deleted: false
  };
  await writeRevision(file);
  return publicComic(file);
}

export async function updateComicRevision(id, patch) {
  const file = await getComic(id);
  const next = { ...file, ...patch, id: file.id, deleted: false };
  await writeRevision(next);
  return next;
}

export async function removeComic(id) {
  const file = await getComic(id);
  await writeRevision({ id, deleted: true });
  if (file.sourceType === 'blob' && isBlobConfigured()) {
    const targets = [file.blobUrl, file.thumbnailUrl, ...(file.archivePages || []).map((page) => page.url)].filter((url) => /^https?:/i.test(String(url || '')));
    if (targets.length) await del(targets).catch(() => {});
  }
  return { removed: id };
}

export async function libraryStatus() {
  const catalog = await getCatalog();
  const counts = {};
  for (const file of catalog.files) counts[normalizedCategory(file)] = (counts[normalizedCategory(file)] || 0) + 1;
  return {
    mode: 'vercel',
    total: catalog.files.length,
    counts,
    sources: catalog.sources,
    blobConfigured: isBlobConfigured(),
    adminConfigured: isAdminConfigured(),
    writeEnabled: isBlobConfigured() && isAdminConfigured(),
    uploadEnabled: isBlobConfigured() && isAdminConfigured()
  };
}
