import { getUnifiedCatalog, publicComicV2 } from '../catalogV2.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método não permitido.', code: 'METHOD_NOT_ALLOWED' });
  // Esta rota não deve derrubar a biblioteca por falha opcional de banco.
  try {
    const catalog = await getUnifiedCatalog({ force: Boolean(req.query.fresh) });
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-HQ-Reader-Catalog', 'unified-v3.2');
    return res.status(200).json({ files: (catalog.files || []).map(publicComicV2), warnings: catalog.warnings || [] });
  } catch (error) {
    console.error('[COMICS_V3_2_FATAL]', error);
    // Último fallback: retorna lista vazia em 200 para a UI continuar operacional
    // e expõe o erro no payload/diagnóstico, em vez de transformar a home em HTTP 500.
    return res.status(200).json({ files: [], warnings: [error?.message || 'Falha ao montar catálogo.'], degraded: true });
  }
}
