import { assertAdminRequest } from '../auth.js';
import { getUnifiedCatalog } from '../catalogV2.js';
import { crawlDriveSourceApi, hasGoogleDriveApiKey } from '../driveApiCrawler.js';
import { sendError } from '../http.js';

export const config = { maxDuration: 300 };

export default async function handler(req, res) {
  try {
    await assertAdminRequest(req);
    if (req.method === 'GET') {
      const catalog = await getUnifiedCatalog();
      return res.status(200).json({
        configured: hasGoogleDriveApiKey(),
        sources: catalog.sources || []
      });
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido.', code: 'METHOD_NOT_ALLOWED' });

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const sourceId = String(body.sourceId || '').trim();
    if (!sourceId) return res.status(400).json({ error: 'Informe sourceId.', code: 'SOURCE_ID_REQUIRED' });

    const catalog = await getUnifiedCatalog({ force: true });
    const source = (catalog.sources || []).find((item) => String(item.id) === sourceId);
    if (!source) return res.status(404).json({ error: 'Fonte do Drive não encontrada.', code: 'SOURCE_NOT_FOUND' });

    const result = await crawlDriveSourceApi(source, { continuation: body.continuation || null });
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      ok: true,
      source: result.summary,
      filesFoundThisPass: result.files.length,
      complete: result.complete,
      continuation: result.continuation
    });
  } catch (error) {
    return sendError(res, error);
  }
}
