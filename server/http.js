export function setCorsForSameOrigin(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
}

export function sendError(res, error) {
  const status = Number(error?.status || error?.statusCode || 500);
  const safe = status >= 400 && status < 600 ? status : 500;
  if (safe >= 500) console.error(`[${error?.code || 'INTERNAL_ERROR'}]`, error);
  return res.status(safe).json({ error: error?.message || 'Não foi possível concluir a solicitação.', code: error?.code || 'INTERNAL_ERROR' });
}

export async function pipeFetchResponse(upstream, res, { cacheControl = 'public, s-maxage=86400, stale-while-revalidate=604800' } = {}) {
  res.status(upstream.status);
  for (const header of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'etag', 'last-modified']) {
    const value = upstream.headers.get(header);
    if (value) res.setHeader(header, value);
  }
  res.setHeader('Cache-Control', cacheControl);
  if (!upstream.body) return res.end();
  try {
    for await (const chunk of upstream.body) {
      if (!res.write(Buffer.from(chunk))) await new Promise((resolve) => res.once('drain', resolve));
    }
    return res.end();
  } catch (error) {
    res.destroy(error);
  }
}
