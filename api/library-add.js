import { assertAdminRequest } from '../server/auth.js';
import { addDriveComic } from '../server/catalog.js';
import { sendError } from '../server/http.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido.', code: 'METHOD_NOT_ALLOWED' });
  try {
    assertAdminRequest(req);
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const file = await addDriveComic({ url: body.url, name: body.name, path: body.path });
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ file });
  } catch (error) { return sendError(res, error); }
}
