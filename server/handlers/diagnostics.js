import { supabaseConfiguration } from '../supabase.js';
import { checkSupabaseSchema } from '../supabaseStore.js';
import { hasGoogleDriveApiKey } from '../driveApiCrawler.js';
import { getUnifiedCatalog, unifiedLibraryStatus } from '../catalogV2.js';
import { sendError } from '../http.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método não permitido.', code: 'METHOD_NOT_ALLOWED' });
  try {
    const [schema, catalog, library] = await Promise.all([
      checkSupabaseSchema().catch(() => false),
      getUnifiedCatalog().catch(() => ({ files: [], sources: [], warnings: ['Falha ao ler catálogo'] })),
      unifiedLibraryStatus().catch(() => null)
    ]);
    return res.status(200).json({
      ok: true,
      version: '3.2.1',
      supabase: { ...supabaseConfiguration(), schemaAvailable: schema },
      drive: { apiKeyConfigured: hasGoogleDriveApiKey(), sources: catalog.sources?.length || 0 },
      catalog: { total: catalog.files?.length || 0, warnings: catalog.warnings || [] },
      library
    });
  } catch (error) { return sendError(res, error); }
}
