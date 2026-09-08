import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import comicsRouter from './routes/comics.routes.js';
import libraryRouter from './routes/library.routes.js';
import { syncConfiguredSources } from './services/publicFolderSync.js';

const app = express();
const port = Number(process.env.PORT || 3001);
const frontendOrigin = process.env.FRONTEND_ORIGIN || 'http://localhost:5173';

app.disable('x-powered-by');
app.use(cors({ origin: frontendOrigin }));
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, libraryMode: 'public-catalog', credentialsRequired: false });
});

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
