import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { Router } from 'express';
import {
  getComic,
  getComicPages,
  getComics,
  getContentResponse,
  getDownloadResponse,
  getPage,
  getThumbnailResponse
} from '../services/comicService.js';

const router = Router();

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function parseRange(rangeHeader, size) {
  if (!rangeHeader || !/^bytes=/i.test(rangeHeader)) return null;
  const match = rangeHeader.match(/bytes=(\d*)-(\d*)/i);
  if (!match) return null;
  let start = match[1] ? Number(match[1]) : null;
  let end = match[2] ? Number(match[2]) : null;
  if (start === null && end !== null) {
    const suffixLength = Math.min(end, size);
    start = size - suffixLength;
    end = size - 1;
  } else {
    start = start ?? 0;
    end = end ?? size - 1;
  }
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || start >= size) return null;
  return { start, end: Math.min(end, size - 1) };
}

async function pipeLocal(source, res) {
  const stat = await fsp.stat(source.filePath);
  const size = stat.size;
  const range = parseRange(source.range, size);
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Content-Type', source.mimeType || 'application/octet-stream');
  if (range) {
    const contentLength = range.end - range.start + 1;
    res.status(206);
    res.setHeader('Content-Range', `bytes ${range.start}-${range.end}/${size}`);
    res.setHeader('Content-Length', contentLength);
  } else {
    res.status(200);
    res.setHeader('Content-Length', size);
  }
  const stream = fs.createReadStream(source.filePath, range ? { start: range.start, end: range.end } : undefined);
  await new Promise((resolve, reject) => {
    stream.on('error', reject);
    res.on('close', resolve);
    res.on('finish', resolve);
    stream.pipe(res);
  });
}

async function pipeUpstream(upstream, res) {
  const status = upstream.status;
  res.status(status);
  for (const header of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'etag', 'last-modified']) {
    const value = upstream.headers.get(header);
    if (value) res.setHeader(header, value);
  }
  if (!upstream.body) return res.end();
  const reader = upstream.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!res.write(Buffer.from(value))) {
        await new Promise((resolve) => res.once('drain', resolve));
      }
    }
    res.end();
  } catch (error) {
    res.destroy(error);
  } finally {
    reader.releaseLock();
  }
}

async function pipeContent(source, res, { cacheControl = 'public, max-age=3600, stale-while-revalidate=86400' } = {}) {
  res.setHeader('Cache-Control', cacheControl);
  if (source?.type === 'local') return pipeLocal(source, res);
  return pipeUpstream(source, res);
}

function attachmentHeader(filename) {
  const ascii = path.basename(filename).replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_');
  const encoded = encodeURIComponent(path.basename(filename)).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

router.get('/', asyncRoute(async (_req, res) => {
  const files = await getComics();
  res.json({ files });
}));

router.get('/:id/download', asyncRoute(async (req, res) => {
  const { comic, source } = await getDownloadResponse(req.params.id, req.headers.range);
  res.setHeader('Content-Disposition', attachmentHeader(comic.name));
  return pipeContent(source, res, { cacheControl: 'private, max-age=0, no-store' });
}));

router.get('/:id/pages/:page', asyncRoute(async (req, res) => {
  const result = await getPage(req.params.id, req.params.page);
  if (result.passthrough) {
    const upstream = await getContentResponse(req.params.id, req.headers.range);
    return pipeContent(upstream, res);
  }
  res.setHeader('Content-Type', result.mimeType);
  res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
  res.setHeader('Content-Length', result.data.length);
  res.send(result.data);
}));

router.get('/:id/pages', asyncRoute(async (req, res) => {
  const result = await getComicPages(req.params.id);
  res.json(result);
}));

router.get('/:id/content', asyncRoute(async (req, res) => {
  const upstream = await getContentResponse(req.params.id, req.headers.range);
  return pipeContent(upstream, res);
}));

router.get('/:id/thumbnail', asyncRoute(async (req, res) => {
  const result = await getThumbnailResponse(req.params.id);
  if (!result) return res.status(404).json({ error: 'Miniatura indisponível.', code: 'THUMBNAIL_NOT_FOUND' });
  if (result.localData) {
    res.setHeader('Content-Type', result.mimeType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.send(result.localData);
  }
  return pipeContent(result, res, { cacheControl: 'public, max-age=86400' });
}));

router.get('/:id', asyncRoute(async (req, res) => {
  const comic = await getComic(req.params.id);
  res.json(comic);
}));

export default router;
