import { getArchivePages } from '../server/archiveCache.js';
import { publicComicById } from '../server/comics.js';
import { sendError } from '../server/http.js';

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método não permitido.', code: 'METHOD_NOT_ALLOWED' });
  try {
    const id = String(req.query.id || '');
    const [pages, comic] = await Promise.all([getArchivePages(id), publicComicById(id)]);
    res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
    return res.status(200).json({ comic, pages });
  } catch (error) { return sendError(res, error); }
}
