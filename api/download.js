import { getComic } from '../server/catalog.js';
import { driveDownloadUrl } from '../server/googleDrive.js';
import { sendError } from '../server/http.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  try {
    const file = await getComic(String(req.query.id || ''));
    res.setHeader('Cache-Control', 'private, no-store');
    if (file.sourceType === 'blob' && (file.downloadUrl || file.blobUrl)) return res.redirect(302, file.downloadUrl || file.blobUrl);
    return res.redirect(302, driveDownloadUrl(file));
  } catch (error) { return sendError(res, error); }
}
