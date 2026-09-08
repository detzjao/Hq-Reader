import { getComic } from '../server/catalog.js';
import { fetchPublicFile } from '../server/googleDrive.js';
import { pipeFetchResponse, sendError } from '../server/http.js';

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return res.status(405).end();
  try {
    const id = String(req.query.id || '');
    const direct = String(req.query.direct || '') === '1';
    const resourceKey = String(req.query.resourceKey || req.query.resourcekey || '');

    if (direct) {
      if (!/^[A-Za-z0-9_-]{10,}$/.test(id)) return res.status(400).json({ error: 'Arquivo inválido.', code: 'INVALID_FILE_ID' });
      const upstream = await fetchPublicFile(id, { resourceKey, range: req.headers.range || '', timeout: 50_000 });
      return pipeFetchResponse(upstream, res, { cacheControl: 'public, s-maxage=86400, stale-while-revalidate=604800' });
    }

    const file = await getComic(id);
    if (file.sourceType === 'blob' && file.blobUrl) return res.redirect(307, file.blobUrl);
    const upstream = await fetchPublicFile(file.id, { resourceKey: file.resourceKey || '', range: req.headers.range || '', timeout: 50_000 });
    return pipeFetchResponse(upstream, res, { cacheControl: 'public, s-maxage=86400, stale-while-revalidate=604800' });
  } catch (error) { return sendError(res, error); }
}
