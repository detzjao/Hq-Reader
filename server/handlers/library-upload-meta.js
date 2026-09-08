import { assertAdminRequest } from '../auth.js';
import { addBlobComic } from '../catalog.js';
import { sendError } from '../http.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido.', code: 'METHOD_NOT_ALLOWED' });
  try {
    assertAdminRequest(req);
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const file = await addBlobComic({ blob: body.blob, originalName: body.originalName, size: body.size, path: body.path, thumbnailUrl: body.thumbnailUrl });
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ file });
  } catch (error) { return sendError(res, error); }
}
