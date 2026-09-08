import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Router } from 'express';
import {
  addCatalogFile,
  addLocalCatalogFile,
  importCatalogText,
  libraryStatus,
  removeCatalogFile,
  uploadDir
} from '../services/catalogService.js';
import { getPublicFolderSyncState, syncConfiguredSources } from '../services/publicFolderSync.js';

const router = Router();

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function decodeHeader(value = '') {
  try { return decodeURIComponent(String(value)); } catch { return String(value); }
}

router.get('/', asyncRoute(async (_req, res) => {
  res.json({ ...(await libraryStatus()), sync: getPublicFolderSyncState() });
}));

router.post('/sync', asyncRoute(async (req, res) => {
  const result = await syncConfiguredSources({ force: req.body?.force === true });
  res.json(result);
}));

router.post('/upload', asyncRoute(async (req, res) => {
  const originalName = decodeHeader(req.headers['x-file-name'] || '');
  const collectionPath = decodeHeader(req.headers['x-collection-path'] || '');
  if (!originalName) {
    const error = new Error('Selecione um arquivo para importar.');
    error.code = 'FILE_REQUIRED';
    error.status = 400;
    throw error;
  }

  const maxBytes = Number(process.env.MAX_COMIC_BYTES || 524_288_000);
  const declaredSize = Number(req.headers['content-length'] || 0);
  if (declaredSize && declaredSize > maxBytes) {
    const error = new Error('O arquivo excede o limite de tamanho configurado.');
    error.code = 'FILE_TOO_LARGE';
    error.status = 413;
    throw error;
  }

  await fs.mkdir(uploadDir(), { recursive: true });
  const tempPath = path.join(uploadDir(), `.upload-${crypto.randomUUID()}.tmp`);
  const handle = await fs.open(tempPath, 'wx', 0o600);
  let total = 0;
  try {
    for await (const chunk of req) {
      total += chunk.length;
      if (total > maxBytes) {
        const error = new Error('O arquivo excede o limite de tamanho configurado.');
        error.code = 'FILE_TOO_LARGE';
        error.status = 413;
        throw error;
      }
      await handle.write(chunk);
    }
  } catch (error) {
    await handle.close().catch(() => {});
    await fs.rm(tempPath, { force: true }).catch(() => {});
    throw error;
  }
  await handle.close();

  try {
    const result = await addLocalCatalogFile({
      tempPath,
      originalName,
      mimeType: String(req.headers['content-type'] || 'application/octet-stream').split(';')[0],
      size: total,
      path: collectionPath
    });
    res.status(201).json(result);
  } catch (error) {
    await fs.rm(tempPath, { force: true }).catch(() => {});
    throw error;
  }
}));

router.post('/', asyncRoute(async (req, res) => {
  const result = await addCatalogFile({
    sourceUrl: req.body?.url,
    name: req.body?.name,
    path: req.body?.path
  });
  res.status(result.updated ? 200 : 201).json(result);
}));

router.post('/import', asyncRoute(async (req, res) => {
  const result = await importCatalogText(req.body?.text);
  res.json(result);
}));

router.delete('/:id', asyncRoute(async (req, res) => {
  const result = await removeCatalogFile(req.params.id);
  res.json(result);
}));

export default router;
