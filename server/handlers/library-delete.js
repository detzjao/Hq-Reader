import { assertAdminRequest } from '../auth.js';
import { removeComic } from '../catalog.js';
import { sendError } from '../http.js';

export default async function handler(req, res) {
  if (req.method !== 'DELETE') return res.status(405).json({ error: 'Método não permitido.', code: 'METHOD_NOT_ALLOWED' });
  try {
    assertAdminRequest(req);
    const result = await removeComic(String(req.query.id || ''));
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(result);
  } catch (error) { return sendError(res, error); }
}
