import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import comicsRouter from './routes/comics.routes.js';
import libraryRouter from './routes/library.routes.js';
import { syncConfiguredSources } from './services/publicFolderSync.js';

const app = express();
const port = Number(process.env.PORT || 3001);
const configuredOrigins = String(
  process.env.FRONTEND_ORIGIN || 'http://localhost:5173,https://hq-reader-seven.vercel.app'
)
  .split(',')
  .map((value) => value.trim().replace(/\/$/, ''))
  .filter(Boolean);
const allowVercelPreviews = String(process.env.ALLOW_VERCEL_PREVIEWS ?? 'true').toLowerCase() !== 'false';

function isAllowedOrigin(origin) {
  if (!origin) return true;
  const normalized = String(origin).replace(/\/$/, '');
  if (configuredOrigins.includes('*') || configuredOrigins.includes(normalized)) return true;
  if (allowVercelPreviews && /^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(normalized)) return true;
  return false;
}

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(cors({
  origin(origin, callback) {
    if (isAllowedOrigin(origin)) return callback(null, true);
    const error = new Error('Origem não autorizada para acessar o HQ Reader.');
    error.code = 'CORS_ORIGIN_DENIED';
    error.status = 403;
    return callback(error);
  }
}));
app.use(express.json({ limit: '1mb' }));

function healthPayload() {
  return { ok: true, libraryMode: 'public-catalog', credentialsRequired: false };
}

app.get('/health', (_req, res) => res.json(healthPayload()));
app.get('/api/health', (_req, res) => res.json(healthPayload()));

app.use('/api/comics', comicsRouter);
app.use('/api/library', libraryRouter);

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Endpoint não encontrado.', code: 'NOT_FOUND' });
});

app.use((error, _req, res, _next) => {
  const status = Number(error.status || error.statusCode || 500);
  const safeStatus = status >= 400 && status < 600 ? status : 500;
  const message = safeStatus >= 500 && !error.code
    ? 'Ocorreu um erro interno ao processar a solicitação.'
    : error.message || 'Não foi possível concluir a solicitação.';
  if (safeStatus >= 500) console.error(`[${error.code || 'INTERNAL_ERROR'}]`, error.message);
  res.status(safeStatus).json({ error: message, code: error.code || 'INTERNAL_ERROR' });
});

app.listen(port, () => {
  console.log(`HQ Reader backend em http://localhost:${port}`);
  if (String(process.env.SYNC_PUBLIC_FOLDERS_ON_START ?? 'true').toLowerCase() !== 'false') {
    syncConfiguredSources().then((summary) => {
      console.log(`Biblioteca atualizada: ${summary.total} HQs.`);
    }).catch((error) => {
      console.warn(`Não foi possível atualizar as pastas públicas ao iniciar: ${error.message}`);
    });
  }
});
