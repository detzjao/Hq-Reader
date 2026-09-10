import { handleUpload } from '@vercel/blob/client';
import { assertAdminAccessToken } from '../auth.js';
import { isSupportedName } from '../formats.js';
import { sendError } from '../http.js';

const ALLOWED_TYPES = [
  'application/pdf', 'application/zip', 'application/x-rar-compressed', 'application/vnd.rar',
  'application/vnd.comicbook+zip', 'application/vnd.comicbook-rar',
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/octet-stream'
];

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido.', code: 'METHOD_NOT_ALLOWED' });
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body;
    const result = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        let payload = {};
        try { payload = JSON.parse(clientPayload || '{}'); } catch {}
        await assertAdminAccessToken(payload.accessToken);
        if (!isSupportedName(pathname)) {
          const error = new Error('Formato não suportado.');
          error.code = 'UNSUPPORTED_FORMAT'; error.status = 415; throw error;
        }
        return {
          allowedContentTypes: ALLOWED_TYPES,
          maximumSizeInBytes: Number(process.env.MAX_UPLOAD_BYTES || 524_288_000),
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ ok: true })
        };
      },
      onUploadCompleted: async () => {}
    });
    return res.status(200).json(result);
  } catch (error) { return sendError(res, error); }
}
