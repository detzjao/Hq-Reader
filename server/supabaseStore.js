import { extension, formatForFile, mimeForName } from './formats.js';
import { hasSupabaseRead, hasSupabaseWrite, requireSupabaseAdmin, supabaseAdmin, supabasePublic } from './supabase.js';

const PAGE_SIZE = 1000;
const WRITE_BATCH = 250;
const ARCHIVE_BUCKET = String(process.env.SUPABASE_ARCHIVE_BUCKET || 'comic-pages').trim() || 'comic-pages';
let schemaAvailable = null;
let archiveBucketReady = false;

function reader() {
  return supabaseAdmin || supabasePublic;
}

function clean(value) {
  return value == null ? '' : String(value);
}

function normalizeCategory(file = {}) {
  return file.category || clean(file.path).split('/')[0] || 'Outros';
}

function compactMetadata(value = {}) {
  const metadata = { ...value };
  delete metadata.archivePages;
  return metadata;
}

export function fileToSupabaseRow(file = {}) {
  const id = clean(file.id).trim();
  if (!id) return null;
  const name = clean(file.name || file.title || `HQ-${id.slice(-8)}`).trim();
  const sourceType = clean(file.sourceType || 'drive') || 'drive';
  return {
    external_id: id,
    drive_file_id: sourceType === 'drive' ? id : null,
    title: name,
    name,
    normalized_title: name.toLocaleLowerCase('pt-BR'),
    category: normalizeCategory(file),
    publisher: file.publisher || null,
    format: file.format || formatForFile(name, file.mimeType),
    mime_type: file.mimeType || mimeForName(name),
    file_url: file.blobUrl || file.sourceUrl || null,
    source_type: sourceType,
    source_url: file.sourceUrl || null,
    resource_key: file.resourceKey || null,
    source_folder_id: file.sourceFolderId || null,
    blob_url: file.blobUrl || null,
    download_url: file.downloadUrl || null,
    thumbnail_url: file.thumbnailUrl || null,
    folder_path: file.path || '',
    file_size: Number(file.size || 0),
    page_count: Number(file.pageCount || 0),
    added_at: file.addedAt || null,
    synced_at: file.syncedAt || null,
    deleted: Boolean(file.deleted),
    metadata: compactMetadata(file),
    updated_at: new Date().toISOString()
  };
}

export function supabaseRowToFile(row = {}) {
  const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  const name = row.name || row.title || metadata.name || `HQ-${clean(row.external_id).slice(-8)}`;
  return {
    ...metadata,
    id: clean(row.external_id || row.drive_file_id || metadata.id),
    name,
    mimeType: row.mime_type || metadata.mimeType || mimeForName(name),
    size: Number(row.file_size ?? metadata.size ?? 0),
    path: row.folder_path ?? metadata.path ?? '',
    category: row.category || metadata.category || 'Outros',
    sourceType: row.source_type || metadata.sourceType || (row.blob_url ? 'blob' : 'drive'),
    sourceUrl: row.source_url || metadata.sourceUrl || '',
    resourceKey: row.resource_key || metadata.resourceKey || '',
    sourceFolderId: row.source_folder_id || metadata.sourceFolderId || '',
    blobUrl: row.blob_url || metadata.blobUrl || '',
    downloadUrl: row.download_url || metadata.downloadUrl || '',
    thumbnailUrl: row.thumbnail_url || metadata.thumbnailUrl || '',
    pageCount: Number(row.page_count ?? metadata.pageCount ?? 0),
    addedAt: row.added_at || metadata.addedAt || row.created_at || null,
    syncedAt: row.synced_at || metadata.syncedAt || null,
    deleted: Boolean(row.deleted)
  };
}

function sourceToRow(source = {}) {
  const id = clean(source.id).trim();
  if (!id) return null;
  return {
    external_id: id,
    folder_id: id,
    name: source.label || source.name || `Drive ${id.slice(-6)}`,
    label: source.label || source.name || `Drive ${id.slice(-6)}`,
    url: source.url || `https://drive.google.com/drive/folders/${id}`,
    category: source.category || clean(source.path).split('/')[0] || 'Outros',
    path: source.path || source.category || 'Outros',
    resource_key: source.resourceKey || null,
    enabled: source.enabled !== false,
    status: source.status || 'pending',
    last_sync: source.lastSyncedAt || source.last_sync || null,
    deleted: Boolean(source.deleted),
    metadata: source,
    updated_at: new Date().toISOString()
  };
}

function rowToSource(row = {}) {
  const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  return {
    ...metadata,
    id: clean(row.external_id || row.folder_id || metadata.id),
    label: row.label || row.name || metadata.label || metadata.name,
    url: row.url || metadata.url,
    category: row.category || metadata.category || 'Outros',
    path: row.path || metadata.path || row.category || 'Outros',
    resourceKey: row.resource_key || metadata.resourceKey || '',
    enabled: row.enabled !== false,
    deleted: Boolean(row.deleted),
    lastSyncedAt: row.last_sync || metadata.lastSyncedAt || null
  };
}

async function queryAll(table, select = '*', mutate = (query) => query) {
  if (!hasSupabaseRead()) return [];
  const db = reader();
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    let query = db.from(table).select(select).range(from, from + PAGE_SIZE - 1);
    query = mutate(query);
    const { data, error } = await query;
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows;
}

export async function checkSupabaseSchema() {
  if (!hasSupabaseRead()) return false;
  if (schemaAvailable !== null) return schemaAvailable;
  try {
    const { error } = await reader().from('comics').select('external_id').limit(1);
    schemaAvailable = !error;
  } catch {
    schemaAvailable = false;
  }
  return schemaAvailable;
}

export function resetSupabaseSchemaProbe() {
  schemaAvailable = null;
}

export async function readSupabaseComics() {
  if (!(await checkSupabaseSchema())) return [];
  const rows = await queryAll('comics', '*', (query) => query.eq('deleted', false));
  return rows.map(supabaseRowToFile).filter((file) => file.id && !file.deleted);
}

export async function readSupabaseComic(id) {
  if (!(await checkSupabaseSchema())) return null;
  const { data, error } = await reader().from('comics').select('*').eq('external_id', clean(id)).eq('deleted', false).maybeSingle();
  if (error) throw error;
  return data ? supabaseRowToFile(data) : null;
}

export async function upsertSupabaseComics(files = []) {
  if (!hasSupabaseWrite()) return false;
  const rows = files.map(fileToSupabaseRow).filter(Boolean);
  if (!rows.length) return true;
  const db = requireSupabaseAdmin();
  for (let offset = 0; offset < rows.length; offset += WRITE_BATCH) {
    const batch = rows.slice(offset, offset + WRITE_BATCH);
    const { error } = await db.from('comics').upsert(batch, { onConflict: 'external_id', ignoreDuplicates: false });
    if (error) throw error;
  }
  schemaAvailable = true;
  return true;
}

export async function upsertSupabaseComic(file) {
  return upsertSupabaseComics([file]);
}

export async function softDeleteSupabaseComic(id) {
  if (!hasSupabaseWrite()) return false;
  const { error } = await requireSupabaseAdmin().from('comics').update({ deleted: true, updated_at: new Date().toISOString() }).eq('external_id', clean(id));
  if (error) throw error;
  return true;
}

export async function readSupabaseSources() {
  if (!(await checkSupabaseSchema())) return [];
  const rows = await queryAll('drive_sources', '*', (query) => query.eq('deleted', false));
  return rows.map(rowToSource).filter((source) => source.id && !source.deleted);
}

export async function upsertSupabaseSources(sources = []) {
  if (!hasSupabaseWrite()) return false;
  const rows = sources.map(sourceToRow).filter(Boolean);
  if (!rows.length) return true;
  const db = requireSupabaseAdmin();
  for (let offset = 0; offset < rows.length; offset += WRITE_BATCH) {
    const { error } = await db.from('drive_sources').upsert(rows.slice(offset, offset + WRITE_BATCH), { onConflict: 'external_id' });
    if (error) throw error;
  }
  return true;
}

export async function upsertSupabaseSource(source) {
  return upsertSupabaseSources([source]);
}

export async function upsertSupabaseSourceStatus(status = {}) {
  if (!hasSupabaseWrite() || !status?.id) return false;
  const row = {
    source_external_id: clean(status.id),
    ok: status.ok !== false,
    complete: status.complete !== false,
    files: Number(status.files || 0),
    folders: Number(status.folders || 0),
    failed_folders: Number(status.failedFolders || 0),
    formats: status.formats || {},
    error: status.error || null,
    synced_at: status.syncedAt || new Date().toISOString(),
    metadata: status
  };
  const { error } = await requireSupabaseAdmin().from('source_sync_status').upsert(row, { onConflict: 'source_external_id' });
  if (error) throw error;
  return true;
}

export async function readSupabaseSourceStatuses() {
  if (!(await checkSupabaseSchema())) return [];
  try {
    const rows = await queryAll('source_sync_status');
    return rows.map((row) => ({
      ...(row.metadata || {}),
      id: row.source_external_id,
      ok: row.ok !== false,
      complete: row.complete !== false,
      files: Number(row.files || 0),
      folders: Number(row.folders || 0),
      failedFolders: Number(row.failed_folders || 0),
      formats: row.formats || {},
      error: row.error || '',
      syncedAt: row.synced_at || null
    }));
  } catch {
    return [];
  }
}

export async function readSupabaseSharedState(profileKey = 'default') {
  if (!(await checkSupabaseSchema())) return null;
  try {
    const { data, error } = await reader().from('shared_user_state').select('payload,updated_at').eq('profile_key', clean(profileKey) || 'default').maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return { ...(data.payload || {}), updatedAt: data.payload?.updatedAt || data.updated_at || null };
  } catch {
    return null;
  }
}

export async function writeSupabaseSharedState(payload, profileKey = 'default') {
  if (!hasSupabaseWrite()) return false;
  const value = { ...(payload || {}), updatedAt: new Date().toISOString() };
  const { error } = await requireSupabaseAdmin().from('shared_user_state').upsert({
    profile_key: clean(profileKey) || 'default',
    payload: value,
    updated_at: value.updatedAt
  }, { onConflict: 'profile_key' });
  if (error) throw error;
  return value;
}

async function ensureArchiveBucket() {
  if (archiveBucketReady) return true;
  if (!hasSupabaseWrite()) return false;
  const db = requireSupabaseAdmin();
  const { data } = await db.storage.getBucket(ARCHIVE_BUCKET);
  if (!data) {
    const { error } = await db.storage.createBucket(ARCHIVE_BUCKET, {
      public: true,
      fileSizeLimit: Number(process.env.SUPABASE_ARCHIVE_PAGE_LIMIT || 25 * 1024 * 1024),
      allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
    });
    if (error && !/already exists/i.test(error.message || '')) throw error;
  }
  archiveBucketReady = true;
  return true;
}

export async function readStoredArchivePages(externalComicId) {
  if (!(await checkSupabaseSchema())) return [];
  try {
    const { data: status, error: statusError } = await reader().from('archive_cache').select('status,page_count').eq('comic_external_id', clean(externalComicId)).maybeSingle();
    if (statusError || status?.status !== 'complete' || !Number(status.page_count || 0)) return [];
    const { data, error } = await reader().from('comic_pages')
      .select('page_number,image_url,mime_type,size_bytes,storage_path')
      .eq('comic_external_id', clean(externalComicId))
      .order('page_number', { ascending: true });
    if (error) throw error;
    if ((data || []).length !== Number(status.page_count || 0)) return [];
    return (data || []).map((page) => ({
      page: Number(page.page_number),
      url: page.image_url,
      mimeType: page.mime_type || 'image/jpeg',
      size: Number(page.size_bytes || 0),
      storagePath: page.storage_path || ''
    }));
  } catch {
    return [];
  }
}

export async function beginArchiveCache(externalComicId, format) {
  if (!hasSupabaseWrite()) return false;
  const { error } = await requireSupabaseAdmin().from('archive_cache').upsert({
    comic_external_id: clean(externalComicId),
    format: clean(format),
    status: 'processing',
    page_count: 0,
    error: null,
    updated_at: new Date().toISOString()
  }, { onConflict: 'comic_external_id' });
  if (error) throw error;
  return true;
}

export async function markArchiveCacheFailed(externalComicId, errorValue) {
  if (!hasSupabaseWrite()) return false;
  const { error } = await requireSupabaseAdmin().from('archive_cache').upsert({
    comic_external_id: clean(externalComicId),
    status: 'failed',
    error: clean(errorValue).slice(0, 2000),
    updated_at: new Date().toISOString()
  }, { onConflict: 'comic_external_id' });
  if (error) throw error;
  return true;
}

function safeArchiveId(value) {
  return clean(value).replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 180) || 'comic';
}

export async function uploadArchivePage(externalComicId, pageNumber, page) {
  await ensureArchiveBucket();
  const db = requireSupabaseAdmin();
  const ext = extension(page.name) || (page.mimeType === 'image/png' ? 'png' : page.mimeType === 'image/webp' ? 'webp' : page.mimeType === 'image/gif' ? 'gif' : 'jpg');
  const storagePath = `archives/${safeArchiveId(externalComicId)}/${String(pageNumber).padStart(5, '0')}.${ext}`;
  const { error: uploadError } = await db.storage.from(ARCHIVE_BUCKET).upload(storagePath, page.data, {
    contentType: page.mimeType || mimeForName(page.name),
    cacheControl: '31536000',
    upsert: true
  });
  if (uploadError) throw uploadError;
  const { data: publicData } = db.storage.from(ARCHIVE_BUCKET).getPublicUrl(storagePath);
  const imageUrl = publicData?.publicUrl;
  if (!imageUrl) throw new Error('O Supabase não retornou a URL pública da página extraída.');
  const row = {
    comic_external_id: clean(externalComicId),
    page_number: Number(pageNumber),
    storage_path: storagePath,
    image_url: imageUrl,
    mime_type: page.mimeType || mimeForName(page.name),
    size_bytes: Number(page.data?.byteLength || page.data?.length || 0)
  };
  const { error } = await db.from('comic_pages').upsert(row, { onConflict: 'comic_external_id,page_number' });
  if (error) throw error;
  return { page: Number(pageNumber), url: imageUrl, mimeType: row.mime_type, size: row.size_bytes, storagePath };
}

export async function finishArchiveCache(externalComicId, pages = []) {
  if (!hasSupabaseWrite()) return false;
  const db = requireSupabaseAdmin();
  const pageCount = pages.length;
  const { error } = await db.from('archive_cache').upsert({
    comic_external_id: clean(externalComicId),
    status: 'complete',
    page_count: pageCount,
    error: null,
    updated_at: new Date().toISOString()
  }, { onConflict: 'comic_external_id' });
  if (error) throw error;
  if (pageCount) {
    await db.from('comics').update({ page_count: pageCount, updated_at: new Date().toISOString() }).eq('external_id', clean(externalComicId));
  }
  return true;
}

export async function deleteSupabaseArchive(externalComicId) {
  if (!hasSupabaseWrite()) return false;
  const db = requireSupabaseAdmin();
  let paths = [];
  try {
    const { data } = await db.from('comic_pages').select('storage_path').eq('comic_external_id', clean(externalComicId));
    paths = (data || []).map((row) => row.storage_path).filter(Boolean);
  } catch {}
  if (paths.length) await db.storage.from(ARCHIVE_BUCKET).remove(paths).catch(() => {});
  await db.from('comic_pages').delete().eq('comic_external_id', clean(externalComicId));
  await db.from('archive_cache').delete().eq('comic_external_id', clean(externalComicId));
  return true;
}
