import { assertAdminRequest } from '../auth.js';
import { migrateLegacyCatalogToSupabase } from '../catalog.js';
import { sendError } from '../http.js';

export const config = { maxDuration: 300 };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido.', code: 'METHOD_NOT_ALLOWED' });
  try {
    await assertAdminRequest(req);
    const result = await migrateLegacyCatalogToSupabase();
    res.setHeader('Cache-Control', 'private, no-store');
    return res.status(200).json(result);
  } catch (error) {
    return sendError(res, error);
  }
}
