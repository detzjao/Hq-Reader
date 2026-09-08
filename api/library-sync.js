import { assertAdminRequest } from '../server/auth.js';
import { syncConfiguredSources } from '../server/publicFolderSync.js';
import { sendError } from '../server/http.js';

export const config = { maxDuration: 300 };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido.', code: 'METHOD_NOT_ALLOWED' });
  try {
    assertAdminRequest(req);
    const result = await syncConfiguredSources();
    res.setHeader('Cache-Control', 'private, no-store');
    return res.status(200).json(result);
  } catch (error) {
    return sendError(res, error);
  }
}
