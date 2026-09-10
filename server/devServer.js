import 'dotenv/config';
import http from 'node:http';
import { URL } from 'node:url';
import apiHandler from '../api/index.js';

const PORT = Number(process.env.LOCAL_API_PORT || 8788);
const HOST = String(process.env.LOCAL_API_HOST || '127.0.0.1');

function decorateResponse(res) {
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (value) => {
    if (!res.headersSent) res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(value));
    return res;
  };
  return res;
}

async function readBody(req) {
  if (req.method === 'GET' || req.method === 'HEAD') return undefined;
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  if (!chunks.length) return undefined;
  const raw = Buffer.concat(chunks).toString('utf8');
  const type = String(req.headers['content-type'] || '');
  if (type.includes('application/json')) {
    try { return JSON.parse(raw || '{}'); } catch { return raw; }
  }
  return raw;
}

const server = http.createServer(async (req, nativeRes) => {
  const res = decorateResponse(nativeRes);
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || `${HOST}:${PORT}`}`);
    if (!url.pathname.startsWith('/api/')) {
      return res.status(404).json({ error: 'Rota local não encontrada.', code: 'LOCAL_ROUTE_NOT_FOUND' });
    }

    const routeFromPath = url.pathname.replace(/^\/api\//, '').replace(/\/+$/, '');
    req.query = Object.fromEntries(url.searchParams.entries());
    if (!req.query.route) req.query.route = routeFromPath;
    req.body = await readBody(req);

    await apiHandler(req, res);
  } catch (error) {
    console.error('[LOCAL_API_ERROR]', error);
    if (!res.headersSent) res.status(500).json({ error: error?.message || 'Erro interno na API local.', code: 'LOCAL_API_ERROR' });
    else res.end();
  }
});

server.listen(PORT, HOST, () => {
  console.log(`\nHQ Reader API local: http://${HOST}:${PORT}`);
  console.log('As rotas /api/* do Vite são encaminhadas para esta API.\n');
});
