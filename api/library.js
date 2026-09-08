import { libraryStatus } from '../server/catalog.js';
import { sendError } from '../server/http.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método não permitido.', code: 'METHOD_NOT_ALLOWED' });
  try {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(await libraryStatus());
  } catch (error) { return sendError(res, error); }
}
