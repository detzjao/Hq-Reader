import { publicComicById } from '../server/comics.js';
import { sendError } from '../server/http.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método não permitido.', code: 'METHOD_NOT_ALLOWED' });
  try {
    const id = String(req.query.id || '');
    const comic = await publicComicById(id);
    res.setHeader('Cache-Control', 'public, s-maxage=20, stale-while-revalidate=120');
    return res.status(200).json({ comic });
  } catch (error) { return sendError(res, error); }
}
