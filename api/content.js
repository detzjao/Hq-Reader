import { getComic } from '../server/catalog.js';
import { fetchPublicFile } from '../server/googleDrive.js';
import { pipeFetchResponse, sendError } from '../server/http.js';

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return res.status(405).end();
  try {
    const file = await getComic(String(req.query.id || ''));
    if (file.sourceType === 'blob' && file.blobUrl) return res.redirect(307, file.blobUrl);
    const upstream = await fetchPublicFile(file.id, { resourceKey: file.resourceKey || '', range: req.headers.range || '', timeout: 50_000 });
    return pipeFetchResponse(upstream, res, { cacheControl: 'public, s-maxage=86400, stale-while-revalidate=604800' });
  } catch (error) { return sendError(res, error); }
}
