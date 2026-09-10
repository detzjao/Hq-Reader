import { assertAdminRequest } from '../auth.js';
import { unifiedLibraryStatus } from '../catalogV2.js';
import { sendError } from '../http.js';

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json(await unifiedLibraryStatus({ force: Boolean(req.query.fresh) }));
    }
    if (req.method === 'POST') {
      await assertAdminRequest(req);
      return res.status(400).json({
        error: 'Use a sincronização Drive v3.2 pelo painel administrativo.',
        code: 'USE_DRIVE_SYNC_V2'
      });
    }
    return res.status(405).json({ error: 'Método não permitido.', code: 'METHOD_NOT_ALLOWED' });
  } catch (error) { return sendError(res, error); }
}
