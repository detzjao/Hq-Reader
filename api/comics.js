import { listPublicComics } from '../server/comics.js';
import { sendError } from '../server/http.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método não permitido.', code: 'METHOD_NOT_ALLOWED' });
  try {
    const files = await listPublicComics(Boolean(req.query.fresh));
    res.setHeader('Cache-Control', 'public, s-maxage=20, stale-while-revalidate=120');
    return res.status(200).json({ files });
  } catch (error) { return sendError(res, error); }
}
