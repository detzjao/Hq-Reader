import { assertAdminRequest } from '../auth.js';
import { libraryStatus } from '../catalog.js';
import { importRecoveredDriveFiles, registerPublicFolderSources, syncConfiguredSources } from '../publicFolderSync.js';
import { sendError } from '../http.js';

export const config = { maxDuration: 300 };

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json(await libraryStatus({ force: Boolean(req.query.fresh) }));
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      if (body.action === 'register-sources') {
        assertAdminRequest(req);
        const result = await registerPublicFolderSources(body.sources || []);
        res.setHeader('Cache-Control', 'private, no-store');
        return res.status(200).json(result);
      }
      if (body.action === 'recover-files') {
        assertAdminRequest(req);
        const result = await importRecoveredDriveFiles(body.files || []);
        res.setHeader('Cache-Control', 'private, no-store');
        return res.status(200).json(result);
      }
      const result = await syncConfiguredSources({
        sourceIds: body.sourceIds || [],
        continuation: body.continuation || null
      });
      res.setHeader('Cache-Control', 'private, no-store');
      return res.status(200).json(result);
    }

    return res.status(405).json({ error: 'Método não permitido.', code: 'METHOD_NOT_ALLOWED' });
  } catch (error) {
    return sendError(res, error);
  }
}
