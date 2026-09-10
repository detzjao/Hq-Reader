import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { del, get, list, put } from '@vercel/blob';
import { isAdminConfigured } from './auth.js';
import { driveThumbnailUrl, parseGoogleDriveLink, probePublicFile } from './googleDrive.js';
import { ensureSupportedExtension, extension, extensionForMime, formatForFile, isSupportedName, mimeForName } from './formats.js';
import { naturalSort } from './naturalSort.js';
import { hasSupabaseRead, hasSupabaseWrite } from './supabase.js';
import {
  deleteSupabaseArchive,
  readSupabaseComic,
  readSupabaseComics,
  readSupabaseSources,
  readSupabaseSourceStatuses,
  softDeleteSupabaseComic,
  upsertSupabaseComic,
  upsertSupabaseComics,
  upsertSupabaseSource,
  upsertSupabaseSourceStatus,
  upsertSupabaseSources
} from './supabaseStore.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INITIAL_PATH = path.resolve(__dirname, '../data/initial-library.json');
const REVISION_PREFIX = 'hq-reader/catalog-revisions/';
const SYNC_SNAPSHOT_PREFIX = 'hq-reader/sync-snapshots/';
const SOURCE_REVISION_PREFIX = 'hq-reader/source-revisions/';
const SOURCE_SYNC_STATUS_PREFIX = 'hq-reader/source-sync-status/';
let seedPromise = null;
let dynamicCache = { at: 0, files: null };
let syncSnapshotCache = { at: 0, files: null };
let sourceCache = { at: 0, sources: null };
let sourceSyncStatusCache = { at: 0, statuses: null };
let supabaseLegacyMirrorAttempted = false;

let metadataBlobAccess = null;

function metadataPutOptions(access) {
  return {
    access,
    addRandomSuffix: false,
    contentType: 'application/json',
    cacheControlMaxAge: 31536000
  };
}

async function putMetadataBlob(pathname, value) {
  const preferred = metadataBlobAccess ? [metadataBlobAccess] : ['public', 'private'];
  let lastError = null;
  for (const access of preferred) {
    try {
      const result = await put(pathname, value, metadataPutOptions(access));
      metadataBlobAccess = access;
      return result;
    } catch (error) {
      lastError = error;
      // O acesso do Blob Store é fixo. Se a primeira tentativa usar o modo
      // oposto ao da Store, tenta o outro automaticamente.
      if (metadataBlobAccess) break;
    }
  }
  throw lastError || new Error('Falha ao salvar metadados no Vercel Blob.');
}

async function readPrivateJson(pathname) {
  const result = await get(pathname, { access: 'private', useCache: false });
  if (!result?.stream) throw new Error('Metadado privado não encontrado.');
  const raw = await new Response(result.stream).text();
  return JSON.parse(raw);
}

async function fetchJsonBlob(blob) {
  // Stores públicos podem ser lidos diretamente pela URL. Stores privados usam
  // get() autenticado via OIDC/token. Isso permite o mesmo código nos dois modos.
  if (blob?.url) {
    try {
      const response = await fetch(blob.url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10_000) });
      if (response.ok) {
        metadataBlobAccess = metadataBlobAccess || 'public';
        return response.json();
      }
    } catch {}
  }
  if (!blob?.pathname) throw new Error('Metadado sem pathname.');
  const value = await readPrivateJson(blob.pathname);
  metadataBlobAccess = 'private';
  return value;
}

export function isBlobConfigured() {
  // Vercel Blob pode autenticar de duas formas:
  // 1) token legado BLOB_READ_WRITE_TOKEN;
  // 2) OIDC (padrão atual da Vercel), identificado pelo BLOB_STORE_ID.
  //
  // Em Functions o token OIDC é injetado no contexto da requisição e o
  // @vercel/blob >= 2.4 o resolve automaticamente. Por isso não devemos
  // exigir BLOB_READ_WRITE_TOKEN para considerar o armazenamento conectado.
  return Boolean(
    String(process.env.BLOB_READ_WRITE_TOKEN || '').trim()
    || String(process.env.BLOB_STORE_ID || '').trim()
  );
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
    const values = await Promise.allSettled(batch.map((blob) => fetchJsonBlob(blob)));
    for (const value of values) if (value.status === 'fulfilled' && value.value?.id) revisions.push(value.value);
  }
  dynamicCache = { at: Date.now(), files: revisions };
  return revisions;
}



async function dynamicSourceRevisions({ force = false } = {}) {
  if (!isBlobConfigured()) return [];
  const ttl = Number(process.env.CATALOG_CACHE_MS || 20_000);
  if (!force && sourceCache.sources && Date.now() - sourceCache.at < ttl) return sourceCache.sources;
  const blobs = await listAllBlobs(SOURCE_REVISION_PREFIX);
  const revisions = [];
  for (let offset = 0; offset < blobs.length; offset += 20) {
    const batch = blobs.slice(offset, offset + 20);
    const values = await Promise.allSettled(batch.map((blob) => fetchJsonBlob(blob)));
    for (const value of values) if (value.status === 'fulfilled' && value.value?.id) revisions.push(value.value);
  }
  sourceCache = { at: Date.now(), sources: revisions };
  return revisions;
}

async function dynamicSourceSyncStatuses({ force = false } = {}) {
  if (!isBlobConfigured()) return [];
  const ttl = Number(process.env.CATALOG_CACHE_MS || 20_000);
  if (!force && sourceSyncStatusCache.statuses && Date.now() - sourceSyncStatusCache.at < ttl) return sourceSyncStatusCache.statuses;
  const blobs = await listAllBlobs(SOURCE_SYNC_STATUS_PREFIX);
  const revisions = [];
  for (let offset = 0; offset < blobs.length; offset += 20) {
    const batch = blobs.slice(offset, offset + 20);
    const values = await Promise.allSettled(batch.map((blob) => fetchJsonBlob(blob)));
    for (const value of values) if (value.status === 'fulfilled' && value.value?.id) revisions.push(value.value);
  }
  sourceSyncStatusCache = { at: Date.now(), statuses: revisions };
  return revisions;
}

function latestStatusById(revisions) {
  const latest = new Map();
  for (const revision of revisions) {
    const previous = latest.get(revision.id);
    const currentTime = Date.parse(revision._revisionAt || revision.syncedAt || 0) || 0;
    const previousTime = Date.parse(previous?._revisionAt || previous?.syncedAt || 0) || 0;
    if (!previous || currentTime >= previousTime) latest.set(revision.id, revision);
  }
  return latest;
}

export async function saveSourceSyncStatus(status) {
  if (!status?.id) return false;
  let persisted = false;
  if (hasSupabaseWrite()) {
    try {
      await upsertSupabaseSourceStatus(status);
      persisted = true;
    } catch {}
  }
  if (isBlobConfigured()) {
    try {
      const now = new Date().toISOString();
      const revision = { ...status, syncedAt: status.syncedAt || now, _revisionAt: now };
      const pathname = `${SOURCE_SYNC_STATUS_PREFIX}${encodeURIComponent(status.id)}/${Date.now()}-${crypto.randomUUID()}.json`;
      await putMetadataBlob(pathname, JSON.stringify(revision));
      sourceSyncStatusCache = { at: 0, statuses: null };
      persisted = true;
    } catch {}
  }
  return persisted;
}

function latestSourceById(revisions) {
  const latest = new Map();
  for (const revision of revisions) {
    const previous = latest.get(revision.id);
    const currentTime = Date.parse(revision._revisionAt || revision.updatedAt || 0) || 0;
    const previousTime = Date.parse(previous?._revisionAt || previous?.updatedAt || 0) || 0;
    if (!previous || currentTime >= previousTime) latest.set(revision.id, revision);
  }
  return latest;
}

export async function saveCatalogSource(source) {
  if (!source?.id) return false;
  let persisted = false;
  if (hasSupabaseWrite()) {
    try {
      await upsertSupabaseSource(source);
      persisted = true;
    } catch {}
  }
  if (isBlobConfigured()) {
    try {
      const revision = { ...source, _revisionAt: new Date().toISOString() };
      const pathname = `${SOURCE_REVISION_PREFIX}${encodeURIComponent(source.id)}/${Date.now()}-${crypto.randomUUID()}.json`;
      await putMetadataBlob(pathname, JSON.stringify(revision));
      sourceCache = { at: 0, sources: null };
      persisted = true;
    } catch {}
  }
  return persisted;
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
    const value = await fetchJsonBlob(latest);
    const files = Array.isArray(value?.files) ? value.files : [];
    syncSnapshotCache = { at: Date.now(), files };
    return files;
  } catch {
    syncSnapshotCache = { at: Date.now(), files: [] };
    return [];
  }
}

export async function saveSyncSnapshot(files) {
  const unique = [...new Map((files || []).filter((file) => file?.id).map((file) => [file.id, file])).values()];
  let persisted = false;
  if (hasSupabaseWrite()) {
    try {
      await upsertSupabaseComics(unique);
      persisted = true;
    } catch {}
  }
  if (isBlobConfigured()) {
    try {
      const payload = { syncedAt: new Date().toISOString(), files: unique };
      const pathname = `${SYNC_SNAPSHOT_PREFIX}${Date.now()}-${crypto.randomUUID()}.json`;
      await putMetadataBlob(pathname, JSON.stringify(payload));
      syncSnapshotCache = { at: Date.now(), files: unique };
      persisted = true;
    } catch {}
  }
  return persisted;
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
  const ext = extension(file.name) || extensionForMime(file.mimeType);
  const format = formatForFile(file.name, file.mimeType);
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

async function getLegacyCatalog({ force = false } = {}) {
  const base = await seed();
  const sourceById = new Map((base.sources || []).filter((source) => source?.id).map((source) => [source.id, { ...source }]));
  const sourceLatest = latestSourceById(await dynamicSourceRevisions({ force }));
  for (const [id, revision] of sourceLatest) {
    if (revision.deleted) sourceById.delete(id);
    else sourceById.set(id, { ...(sourceById.get(id) || {}), ...revision });
  }
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
  return { version: base.version, updatedAt: base.updatedAt, sources: [...sourceById.values()], files: [...byId.values()] };
}

function sortCatalogFiles(files) {
  const categoryRank = new Map([['Marvel', 0], ['DC Comics', 1], ['Turma da Mônica', 2], ['Outros', 99]]);
  return [...files].filter((file) => file?.id && !file.deleted).sort((a, b) => {
    const ar = categoryRank.get(normalizedCategory(a)) ?? 50;
    const br = categoryRank.get(normalizedCategory(b)) ?? 50;
    return ar - br || naturalSort(`${a.path || ''}/${a.name}`, `${b.path || ''}/${b.name}`);
  });
}

export async function getSeedCatalog() {
  const base = await seed();
  return {
    version: base.version,
    updatedAt: base.updatedAt,
    sources: Array.isArray(base.sources) ? base.sources : [],
    files: sortCatalogFiles(
      (Array.isArray(base.files) ? base.files : []).map((file) => ({
        ...file,
        category: normalizedCategory(file)
      }))
    )
  };
}

export async function getCatalog({ force = false } = {}) {
  // O Google Drive/seed é a base da biblioteca. Integrações opcionais
  // (Supabase e Vercel Blob legado) nunca podem impedir o catálogo de abrir.
  let legacy;
  try {
    legacy = await getLegacyCatalog({ force });
  } catch (error) {
    console.error('[CATALOG_OPTIONAL_STORAGE_FAILED] Usando seed do Google Drive.', error);
    legacy = await getSeedCatalog();
  }

  if (!hasSupabaseRead()) {
    return { ...legacy, files: sortCatalogFiles(legacy.files || []) };
  }

  // Espelha o catálogo legado uma única vez por instância. Isso leva para o
  // Supabase o seed e também snapshots já encontrados nas versões anteriores.
  if (hasSupabaseWrite() && !supabaseLegacyMirrorAttempted) {
    supabaseLegacyMirrorAttempted = true;
    try {
      await upsertSupabaseSources(legacy.sources || []);
      await upsertSupabaseComics(legacy.files || []);
    } catch {
      // Se as migrations ainda não estiverem aplicadas, continua no legado.
    }
  }

  try {
    const [dbFiles, dbSources] = await Promise.all([
      readSupabaseComics(),
      readSupabaseSources()
    ]);
    const sourceById = new Map((legacy.sources || []).filter((source) => source?.id).map((source) => [source.id, source]));
    for (const source of dbSources || []) if (source?.id) sourceById.set(source.id, { ...(sourceById.get(source.id) || {}), ...source });

    const byId = new Map((legacy.files || []).filter((file) => file?.id).map((file) => [file.id, file]));
    for (const file of dbFiles || []) if (file?.id) byId.set(file.id, { ...(byId.get(file.id) || {}), ...file, category: normalizedCategory(file) });

    return {
      version: legacy.version,
      updatedAt: legacy.updatedAt,
      sources: [...sourceById.values()].filter((source) => !source.deleted),
      files: sortCatalogFiles([...byId.values()])
    };
  } catch (error) {
    console.error('[CATALOG_SUPABASE_MERGE_FAILED] Continuando com Google Drive/seed.', error);
    return { ...legacy, files: sortCatalogFiles(legacy.files || []) };
  }
}

export async function getComic(id) {
  if (hasSupabaseRead()) {
    try {
      const file = await readSupabaseComic(id);
      if (file) return file;
    } catch {}
  }
  const catalog = await getCatalog();
  const file = catalog.files.find((item) => item.id === id);
  if (!file) { const e = new Error('HQ não encontrada.'); e.code = 'COMIC_NOT_FOUND'; e.status = 404; throw e; }
  return file;
}

export async function writeRevision(file) {
  const revision = { ...file, _revisionAt: new Date().toISOString() };
  let persisted = false;
  if (hasSupabaseWrite()) {
    try {
      await upsertSupabaseComic(revision);
      persisted = true;
    } catch {}
  }
  if (isBlobConfigured()) {
    try {
      const pathname = `${REVISION_PREFIX}${encodeURIComponent(file.id)}/${Date.now()}-${crypto.randomUUID()}.json`;
      await putMetadataBlob(pathname, JSON.stringify(revision));
      dynamicCache = { at: 0, files: null };
      syncSnapshotCache = { at: 0, files: null };
      persisted = true;
    } catch {}
  }
  if (!persisted) {
    const e = new Error('Configure o Supabase (SERVICE_ROLE) ou o armazenamento legado para salvar alterações.');
    e.code = 'SHARED_STORAGE_NOT_CONFIGURED';
    e.status = 503;
    throw e;
  }
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
  let finalName = String(name || '').trim() || probe?.name || `HQ-${parsed.id.slice(-8)}`;
  finalName = ensureSupportedExtension(finalName, probe?.mimeType, `HQ-${parsed.id.slice(-8)}`);
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
  let persisted = false;
  if (hasSupabaseWrite()) {
    try {
      await softDeleteSupabaseComic(id);
      await deleteSupabaseArchive(id).catch(() => {});
      persisted = true;
    } catch {}
  }
  if (isBlobConfigured()) {
    try {
      await writeRevision({ id, deleted: true });
      persisted = true;
    } catch {}
    if (file.sourceType === 'blob') {
      const targets = [file.blobUrl, file.thumbnailUrl, ...(file.archivePages || []).map((page) => page.url)].filter((url) => /^https?:/i.test(String(url || '')));
      if (targets.length) await del(targets).catch(() => {});
    }
  }
  if (!persisted) {
    const e = new Error('Não foi possível persistir a remoção.');
    e.code = 'REMOVE_NOT_PERSISTED';
    e.status = 503;
    throw e;
  }
  return { removed: id };
}

export async function migrateLegacyCatalogToSupabase() {
  if (!hasSupabaseWrite()) {
    const e = new Error('Configure SUPABASE_SERVICE_ROLE_KEY na Vercel antes de migrar a biblioteca.');
    e.code = 'SUPABASE_SERVICE_ROLE_REQUIRED';
    e.status = 503;
    throw e;
  }
  const legacy = await getLegacyCatalog({ force: true });
  await upsertSupabaseSources(legacy.sources || []);
  await upsertSupabaseComics(legacy.files || []);
  supabaseLegacyMirrorAttempted = true;
  return {
    ok: true,
    comics: (legacy.files || []).length,
    sources: (legacy.sources || []).length
  };
}

export async function libraryStatus({ force = false } = {}) {
  const catalog = await getCatalog({ force });
  const counts = {};
  const metricsBySource = new Map();

  for (const file of catalog.files) {
    const category = normalizedCategory(file);
    counts[category] = (counts[category] || 0) + 1;
    const sourceId = String(file.sourceFolderId || '').trim();
    if (!sourceId) continue;
    const metrics = metricsBySource.get(sourceId) || { files: 0, pdf: 0, cbz: 0, cbr: 0, images: 0, other: 0, lastSyncedAt: null };
    metrics.files += 1;
    const ext = extension(file.name).toLowerCase();
    if (ext === 'pdf') metrics.pdf += 1;
    else if (ext === 'cbz') metrics.cbz += 1;
    else if (ext === 'cbr') metrics.cbr += 1;
    else if (['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext)) metrics.images += 1;
    else metrics.other += 1;
    const syncedAt = file.syncedAt || file.addedAt || null;
    if (syncedAt && (!metrics.lastSyncedAt || Date.parse(syncedAt) > Date.parse(metrics.lastSyncedAt))) metrics.lastSyncedAt = syncedAt;
    metricsBySource.set(sourceId, metrics);
  }

  const legacyStatuses = await dynamicSourceSyncStatuses({ force });
  let supabaseStatuses = [];
  if (hasSupabaseRead()) {
    try { supabaseStatuses = await readSupabaseSourceStatuses(); } catch {}
  }
  const statusById = latestStatusById([...legacyStatuses, ...supabaseStatuses]);
  const sourceStats = (catalog.sources || []).map((source) => {
    const metrics = metricsBySource.get(source.id) || { files: 0, pdf: 0, cbz: 0, cbr: 0, images: 0, other: 0, lastSyncedAt: null };
    const status = statusById.get(source.id) || null;
    return {
      ...source,
      files: metrics.files,
      formats: { pdf: metrics.pdf, cbz: metrics.cbz, cbr: metrics.cbr, images: metrics.images, other: metrics.other },
      folders: Number(status?.folders || 0),
      failedFolders: Number(status?.failedFolders || 0),
      complete: status ? status.complete !== false : null,
      ok: status ? status.ok !== false : null,
      lastError: status?.error || '',
      lastSyncedAt: status?.syncedAt || metrics.lastSyncedAt || null
    };
  });

  return {
    mode: 'vercel',
    total: catalog.files.length,
    counts,
    sources: catalog.sources,
    sourceStats,
    blobConfigured: isBlobConfigured(),
    supabaseConfigured: hasSupabaseRead(),
    supabaseWriteEnabled: hasSupabaseWrite(),
    adminConfigured: isAdminConfigured(),
    writeEnabled: (hasSupabaseWrite() || isBlobConfigured()) && isAdminConfigured(),
    uploadEnabled: isBlobConfigured() && isAdminConfigured()
  };
}
