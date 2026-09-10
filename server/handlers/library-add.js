import { assertAdminRequest } from '../auth.js';
import { addDriveComic } from '../catalog.js';
import { addPublicFolderSource } from '../publicFolderSync.js';
import { sendError } from '../http.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido.', code: 'METHOD_NOT_ALLOWED' });
  try {
    await assertAdminRequest(req);
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const url = String(body.url || '').trim();
    const isFolder = /\/folders\//i.test(url) || /embeddedfolderview/i.test(url);

    if (isFolder) {
      const result = await addPublicFolderSource({
        url,
        label: body.name,
        path: body.path,
        category: String(body.path || '').split('/')[0]
      });
      res.setHeader('Cache-Control', 'private, no-store');
      return res.status(200).json({ type: 'folder', ...result });
    }

    const file = await addDriveComic({ url, name: body.name, path: body.path });
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ type: 'file', file });
  } catch (error) { return sendError(res, error); }
}
