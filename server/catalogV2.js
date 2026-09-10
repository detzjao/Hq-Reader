import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { driveThumbnailUrl } from './googleDrive.js';
import { extension, formatForFile, mimeForName } from './formats.js';
import { naturalSort } from './naturalSort.js';
import { hasSupabaseRead, hasSupabaseWrite } from './supabase.js';
import { readSupabaseComics, readSupabaseSources, readSupabaseSourceStatuses, upsertSupabaseComics, upsertSupabaseSourceStatus } from './supabaseStore.js';
import { mergeRuntimeFiles, readRuntimeCatalog, saveRuntimeSourceStatus } from './runtimeCatalog.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INITIAL_PATH = path.resolve(__dirname, '../data/initial-library.json');
let seedCache = null;

function categoryOf(file = {}) {
  return file.category || String(file.path || '').split('/')[0] || 'Outros';
}

async function seed() {
  if (!seedCache) {
    seedCache = fs.readFile(INITIAL_PATH, 'utf8').then((raw) => {
      const data = JSON.parse(raw);
      return {
        version: data.version || 1,
        updatedAt: data.updatedAt || null,
        files: Array.isArray(data.files) ? data.files : [],
        sources: Array.isArray(data.sources) ? data.sources : []
      };
    });
  }
  return seedCache;
}

function sortFiles(files = []) {
  const rank = new Map([['Marvel', 0], ['DC Comics', 1], ['Turma da Mônica', 2], ['Outros', 50]]);
  return [...files].sort((a, b) => {
    const ar = rank.get(categoryOf(a)) ?? 20;
    const br = rank.get(categoryOf(b)) ?? 20;
    return ar - br || naturalSort(`${a.path || ''}/${a.name || ''}`, `${b.path || ''}/${b.name || ''}`);
  });
}

export function publicComicV2(file = {}) {
  const ext = extension(file.name) || '';
  const format = file.format || formatForFile(file.name, file.mimeType);
  const thumbnailUrl = file.thumbnailUrl || (file.sourceType === 'drive' ? driveThumbnailUrl(file, 560) : '');
  return {
    id: String(file.id),
    name: file.name || file.title || 'HQ',
    mimeType: file.mimeType || mimeForName(file.name),
    size: Number(file.size || 0),
    path: file.path || '',
    category: categoryOf(file),
    publisher: file.publisher || categoryOf(file),
    author: file.author || file.metadata?.author || '',
    artist: file.artist || file.metadata?.artist || '',
    year: file.year || file.metadata?.year || '',
    synopsis: file.synopsis || file.metadata?.synopsis || '',
    sourceType: file.sourceType || 'drive',
    sourceFolderId: file.sourceFolderId || '',
    sourceUrl: file.sourceUrl || '',
    resourceKey: file.resourceKey || '',
    extension: ext,
    format,
    thumbnailUrl,
    contentUrl: file.contentUrl || `/api/content?id=${encodeURIComponent(file.id)}`,
    addedAt: file.addedAt || null,
    syncedAt: file.syncedAt || null
  };
}

export async function getUnifiedCatalog({ force = false } = {}) {
  const base = await seed();
  const runtime = await readRuntimeCatalog({ force });
  const fileById = new Map();
  for (const file of base.files || []) if (file?.id) fileById.set(String(file.id), { ...file, category: categoryOf(file) });
  for (const file of runtime.files || []) if (file?.id) fileById.set(String(file.id), { ...(fileById.get(String(file.id)) || {}), ...file, category: categoryOf(file) });

  const sourceById = new Map((base.sources || []).filter((s) => s?.id).map((s) => [String(s.id), { ...s }]));
  const warnings = [];

  if (hasSupabaseRead()) {
    try {
      const [dbFiles, dbSources] = await Promise.all([readSupabaseComics(), readSupabaseSources()]);
      for (const file of dbFiles || []) if (file?.id) fileById.set(String(file.id), { ...(fileById.get(String(file.id)) || {}), ...file, category: categoryOf(file) });
      for (const source of dbSources || []) if (source?.id) sourceById.set(String(source.id), { ...(sourceById.get(String(source.id)) || {}), ...source });
    } catch (error) {
      warnings.push(`Supabase catálogo: ${error?.message || 'indisponível'}`);
      console.warn('[CATALOG_V2_SUPABASE_READ_FAILED]', error?.message || error);
    }
  }

  return {
    version: 2,
    updatedAt: runtime.updatedAt || base.updatedAt,
    files: sortFiles([...fileById.values()].filter((f) => !f.deleted)),
    sources: [...sourceById.values()].filter((s) => !s.deleted && s.enabled !== false),
    sourceStatuses: runtime.sourceStatuses || {},
    warnings
  };
}

export async function getUnifiedComic(id) {
  const catalog = await getUnifiedCatalog();
  const found = catalog.files.find((file) => String(file.id) === String(id));
  if (!found) {
    const error = new Error('HQ não encontrada.');
    error.code = 'COMIC_NOT_FOUND';
    error.status = 404;
    throw error;
  }
  return found;
}

export async function persistDiscoveredFiles(files = []) {
  const localSaved = await mergeRuntimeFiles(files);
  let supabaseSaved = false;
  if (hasSupabaseWrite() && files.length) {
    try {
      await upsertSupabaseComics(files);
      supabaseSaved = true;
    } catch (error) {
      console.warn('[CATALOG_V2_SUPABASE_WRITE_FAILED]', error?.message || error);
    }
  }
  return { localSaved, supabaseSaved, persisted: localSaved || supabaseSaved };
}

export async function persistSourceStatus(status) {
  const localSaved = await saveRuntimeSourceStatus(status);
  let supabaseSaved = false;
  if (hasSupabaseWrite()) {
    try {
      await upsertSupabaseSourceStatus(status);
      supabaseSaved = true;
    } catch (error) {
      console.warn('[CATALOG_V2_STATUS_SUPABASE_FAILED]', error?.message || error);
    }
  }
  return localSaved || supabaseSaved;
}

export async function unifiedLibraryStatus({ force = false } = {}) {
  const catalog = await getUnifiedCatalog({ force });
  const statusMap = { ...(catalog.sourceStatuses || {}) };
  if (hasSupabaseRead()) {
    try {
      for (const status of await readSupabaseSourceStatuses()) if (status?.id) statusMap[String(status.id)] = { ...(statusMap[String(status.id)] || {}), ...status };
    } catch {}
  }

  const metrics = new Map();
  for (const file of catalog.files) {
    const sid = String(file.sourceFolderId || '');
    if (!sid) continue;
    const value = metrics.get(sid) || { files: 0, pdf: 0, cbz: 0, cbr: 0, images: 0 };
    value.files += 1;
    const ext = String(extension(file.name) || '').toLowerCase();
    if (ext === 'pdf') value.pdf += 1;
    else if (ext === 'cbz') value.cbz += 1;
    else if (ext === 'cbr') value.cbr += 1;
    else value.images += 1;
    metrics.set(sid, value);
  }

  const sourceStats = catalog.sources.map((source) => {
    const count = metrics.get(String(source.id)) || { files: 0, pdf: 0, cbz: 0, cbr: 0, images: 0 };
    const status = statusMap[String(source.id)] || {};
    return {
      ...source,
      files: count.files,
      formats: { pdf: count.pdf, cbz: count.cbz, cbr: count.cbr, images: count.images },
      folders: Number(status.folders || 0),
      failedFolders: Number(status.failedFolders || 0),
      complete: status.complete ?? null,
      ok: status.ok ?? null,
      lastError: status.error || '',
      lastSyncedAt: status.syncedAt || null,
      engine: status.engine || null
    };
  });

  return {
    mode: 'unified-v3.2',
    total: catalog.files.length,
    seedCount: (await seed()).files.length,
    runtimeCount: (await readRuntimeCatalog()).files.length,
    sources: catalog.sources,
    sourceStats,
    googleDriveApiConfigured: Boolean(String(process.env.GOOGLE_DRIVE_API_KEY || '').trim()),
    supabaseReadEnabled: hasSupabaseRead(),
    supabaseWriteEnabled: hasSupabaseWrite(),
    warnings: catalog.warnings
  };
}
