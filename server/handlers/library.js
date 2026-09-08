import { assertAdminRequest } from '../auth.js';
import { libraryStatus } from '../catalog.js';
import { syncConfiguredSources } from '../publicFolderSync.js';
import { sendError } from '../http.js';

export const config = { maxDuration: 300 };

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json(await libraryStatus());
    }

    if (req.method === 'POST') {
      assertAdminRequest(req);
      const result = await syncConfiguredSources();
      res.setHeader('Cache-Control', 'private, no-store');
      return res.status(200).json(result);
    }

    return res.status(405).json({ error: 'Método não permitido.', code: 'METHOD_NOT_ALLOWED' });
  } catch (error) {
    return sendError(res, error);
  }
}
