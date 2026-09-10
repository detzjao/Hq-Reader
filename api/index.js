import archive from '../server/handlers/archive.js';
import blobUpload from '../server/handlers/blob-upload.js';
import comic from '../server/handlers/comic.js';
import comics from '../server/handlers/comics.js';
import content from '../server/handlers/content.js';
import download from '../server/handlers/download.js';
import health from '../server/handlers/health.js';
import libraryAdd from '../server/handlers/library-add.js';
import libraryDelete from '../server/handlers/library-delete.js';
import libraryImport from '../server/handlers/library-import.js';
import libraryUploadMeta from '../server/handlers/library-upload-meta.js';
import library from '../server/handlers/library.js';
import userState from '../server/handlers/user-state.js';
import supabaseHealth from '../server/handlers/supabase-health.js';
import supabaseMigrate from '../server/handlers/supabase-migrate.js';
import adminUsers from '../server/handlers/admin-users.js';
import driveSync from '../server/handlers/drive-sync.js';
import diagnostics from '../server/handlers/diagnostics.js';

export const config = { maxDuration: 300 };

const ROUTES = new Map([
  ['archive', archive],
  ['blob-upload', blobUpload],
  ['comic', comic],
  ['comics', comics],
  ['content', content],
  ['download', download],
  ['health', health],
  ['library-add', libraryAdd],
  ['library-delete', libraryDelete],
  ['library-import', libraryImport],
  ['library-upload-meta', libraryUploadMeta],
  ['library', library],
  ['user-state', userState],
  ['supabase-health', supabaseHealth],
  ['supabase-migrate', supabaseMigrate],
  ['admin-users', adminUsers],
  ['drive-sync', driveSync],
  ['diagnostics', diagnostics]
]);

export default async function handler(req, res) {
  const route = String(req.query.route || '').trim();
  if (!route) return res.status(404).json({ error: 'Rota não encontrada.', code: 'ROUTE_NOT_FOUND' });
  // Não deixa o parâmetro interno contaminar os handlers originais.
  delete req.query.route;
  const target = ROUTES.get(route);
  if (!target) return res.status(404).json({ error: 'Rota não encontrada.', code: 'ROUTE_NOT_FOUND' });
  try {
    return await target(req, res);
  } catch (error) {
    console.error('[API_ROUTE_UNHANDLED]', route, error);
    if (res.headersSent) return res.end();
    const status = Number(error?.status || error?.statusCode || 500);
    return res.status(status >= 400 && status < 600 ? status : 500).json({
      error: error?.message || 'Falha interna na API.',
      code: error?.code || 'API_ROUTE_UNHANDLED',
      route
    });
  }
}

