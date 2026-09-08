import { assertAdminRequest } from '../server/auth.js';
import { importDriveLinks } from '../server/catalog.js';
import { sendError } from '../server/http.js';

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido.', code: 'METHOD_NOT_ALLOWED' });
  try {
    assertAdminRequest(req);
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const result = await importDriveLinks(body.text || '');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(result);
  } catch (error) { return sendError(res, error); }
}
