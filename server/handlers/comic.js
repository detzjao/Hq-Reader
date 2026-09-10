import { getUnifiedComic, publicComicV2 } from '../catalogV2.js';
import { sendError } from '../http.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método não permitido.', code: 'METHOD_NOT_ALLOWED' });
  try {
    const id = String(req.query.id || '').trim();
    if (!id) return res.status(400).json({ error: 'HQ inválida.', code: 'COMIC_ID_REQUIRED' });
    return res.status(200).json({ comic: publicComicV2(await getUnifiedComic(id)) });
  } catch (error) { return sendError(res, error); }
}
