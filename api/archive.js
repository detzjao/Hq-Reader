import { getArchivePages, getArchivePagesForFile } from '../server/archiveCache.js';
import { publicComicById } from '../server/comics.js';
import { publicComic } from '../server/catalog.js';
import { mimeForName } from '../server/formats.js';
import { sendError } from '../server/http.js';

export const config = { maxDuration: 300 };

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método não permitido.', code: 'METHOD_NOT_ALLOWED' });
  try {
    const id = String(req.query.id || '');
    const direct = String(req.query.direct || '') === '1';
    if (direct) {
      const name = String(req.query.name || `HQ-${id.slice(-8)}.cbz`);
      const file = {
        id,
        name,
        mimeType: mimeForName(name),
        sourceType: 'drive',
        resourceKey: String(req.query.resourceKey || req.query.resourcekey || ''),
        category: 'Outros',
        path: ''
      };
      const pages = await getArchivePagesForFile(file, { persist: false });
      res.setHeader('Cache-Control', 'private, no-store');
      return res.status(200).json({ comic: publicComic(file), pages });
    }

    const [pages, comic] = await Promise.all([getArchivePages(id), publicComicById(id)]);
    res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
    return res.status(200).json({ comic, pages });
  } catch (error) { return sendError(res, error); }
}
