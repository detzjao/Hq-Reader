import { getComic } from '../catalog.js';
import { driveDownloadUrl } from '../googleDrive.js';
import { sendError } from '../http.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  try {
    const id = String(req.query.id || '');
    const direct = String(req.query.direct || '') === '1';
    const resourceKey = String(req.query.resourceKey || req.query.resourcekey || '');
    res.setHeader('Cache-Control', 'private, no-store');

    if (direct) {
      if (!/^[A-Za-z0-9_-]{10,}$/.test(id)) return res.status(400).json({ error: 'Arquivo inválido.', code: 'INVALID_FILE_ID' });
      return res.redirect(302, driveDownloadUrl({ id, resourceKey }));
    }

    const file = await getComic(id);
    if (file.sourceType === 'blob' && (file.downloadUrl || file.blobUrl)) return res.redirect(302, file.downloadUrl || file.blobUrl);
    return res.redirect(302, driveDownloadUrl(file));
  } catch (error) { return sendError(res, error); }
}
