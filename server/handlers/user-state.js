import { getSharedUserState, mergeSharedUserState, setSharedFavorite, setSharedReading } from '../userState.js';
import { sendError } from '../http.js';

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      res.setHeader('Cache-Control', 'private, no-store');
      return res.status(200).json(await getSharedUserState({ force: Boolean(req.query.fresh) }));
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      let state;
      if (body.action === 'favorite') state = await setSharedFavorite(body);
      else if (body.action === 'reading') state = await setSharedReading(body);
      else if (body.action === 'merge') state = await mergeSharedUserState(body);
      else return res.status(400).json({ error: 'Ação inválida.', code: 'INVALID_USER_STATE_ACTION' });
      res.setHeader('Cache-Control', 'private, no-store');
      return res.status(200).json({ state });
    }

    return res.status(405).json({ error: 'Método não permitido.', code: 'METHOD_NOT_ALLOWED' });
  } catch (error) {
    return sendError(res, error);
  }
}
