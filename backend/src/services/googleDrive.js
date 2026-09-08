const PUBLIC_DOWNLOAD_BASE = 'https://drive.usercontent.google.com/download';
const PUBLIC_FALLBACK_BASE = 'https://drive.google.com/uc';
const PUBLIC_THUMBNAIL_BASE = 'https://drive.google.com/thumbnail';

export class DriveAccessError extends Error {
  constructor(message, { code = 'DRIVE_ERROR', status = 502, cause } = {}) {
    super(message, { cause });
    this.name = 'DriveAccessError';
    this.code = code;
    this.status = status;
  }
}

function normalizeInput(input = '') {
  return String(input).trim();
}

function maybeRawId(input) {
  return /^[A-Za-z0-9_-]{20,}$/.test(input) ? input : '';
}

export function parseGoogleDriveLink(input) {
  const value = normalizeInput(input);
  if (!value) {
    throw new DriveAccessError('Informe um link público do Google Drive.', {
      code: 'INVALID_DRIVE_LINK',
      status: 400
    });
  }

  const rawId = maybeRawId(value);
  if (rawId) return { id: rawId, resourceKey: '', sourceUrl: value };

  let url;
  try {
    url = new URL(value);
  } catch {
    throw new DriveAccessError('O link informado não é uma URL válida do Google Drive.', {
      code: 'INVALID_DRIVE_LINK',
      status: 400
    });
  }

  const host = url.hostname.toLowerCase();
  const allowedHosts = new Set([
    'drive.google.com',
    'drive.usercontent.google.com',
    'docs.google.com'
  ]);

  if (!allowedHosts.has(host)) {
    throw new DriveAccessError('O link precisa apontar para um arquivo do Google Drive.', {
      code: 'INVALID_DRIVE_LINK',
      status: 400
    });
  }

  if (/\/folders\//i.test(url.pathname)) {
    throw new DriveAccessError(
      'Links de pasta não podem ser enumerados automaticamente sem credencial. Cole os links públicos dos arquivos individuais da pasta.',
      { code: 'DRIVE_FOLDER_LINK_UNSUPPORTED', status: 400 }
    );
  }

  const pathMatch = url.pathname.match(/\/d\/([A-Za-z0-9_-]{20,})/);
  const queryId = url.searchParams.get('id');
  const id = pathMatch?.[1] || (queryId && maybeRawId(queryId));

  if (!id) {
    throw new DriveAccessError('Não foi possível identificar o ID do arquivo nesse link.', {
      code: 'INVALID_DRIVE_LINK',
      status: 400
    });
  }

  return {
    id,
    resourceKey: url.searchParams.get('resourcekey') || url.searchParams.get('resourceKey') || '',
    sourceUrl: value
  };
}

function downloadCandidates(fileId, resourceKey = '') {
  const common = {
    id: fileId,
    export: 'download',
    confirm: 't'
  };
  if (resourceKey) common.resourcekey = resourceKey;

  const primary = new URL(PUBLIC_DOWNLOAD_BASE);
  for (const [key, value] of Object.entries(common)) primary.searchParams.set(key, value);

  const fallback = new URL(PUBLIC_FALLBACK_BASE);
  for (const [key, value] of Object.entries(common)) fallback.searchParams.set(key, value);

  return [primary, fallback];
}

function parseFilename(contentDisposition = '') {
  const utf8 = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8?.[1]) {
    try {
      return decodeURIComponent(utf8[1].replace(/^"|"$/g, ''));
    } catch {
      return utf8[1].replace(/^"|"$/g, '');
    }
  }

  const basic = contentDisposition.match(/filename="([^"]+)"/i)
    || contentDisposition.match(/filename=([^;]+)/i);
  return basic?.[1]?.trim().replace(/^"|"$/g, '') || '';
}

function totalSizeFromHeaders(headers) {
  const contentRange = headers.get('content-range') || '';
  const match = contentRange.match(/\/(\d+)$/);
  if (match) return Number(match[1]);
  return Number(headers.get('content-length') || 0);
}

async function safeCancel(response) {
  try {
    await response.body?.cancel();
  } catch {
    // Ignora falha ao cancelar um corpo que já tenha sido fechado.
  }
}

function looksLikeHtml(response) {
  return (response.headers.get('content-type') || '').toLowerCase().includes('text/html');
}

async function fetchPublicCandidate(url, { range, timeout = 30_000 } = {}) {
  try {
    return await fetch(url, {
      redirect: 'follow',
      headers: {
        'User-Agent': 'HQ-Reader/1.1 (+public-drive-file-reader)',
        Accept: '*/*',
        ...(range ? { Range: range } : {})
      },
      signal: AbortSignal.timeout(timeout)
    });
  } catch (error) {
    throw new DriveAccessError('Não foi possível conectar ao arquivo público no Google Drive.', {
      code: 'DRIVE_PUBLIC_UNAVAILABLE',
      status: 502,
      cause: error
    });
  }
}

export async function fetchPublicFile(fileId, { resourceKey = '', range, timeout = 60_000 } = {}) {
  let lastStatus = 0;

  for (const url of downloadCandidates(fileId, resourceKey)) {
    const response = await fetchPublicCandidate(url, { range, timeout });
    lastStatus = response.status;

    if (response.ok && !looksLikeHtml(response)) return response;

    await safeCancel(response);
  }

  if (lastStatus === 403) {
    throw new DriveAccessError(
      'O Google Drive recusou o download. Verifique se o arquivo está público e se o proprietário permite download.',
      { code: 'DRIVE_DOWNLOAD_RESTRICTED', status: 403 }
    );
  }

  if (lastStatus === 404) {
    throw new DriveAccessError('O arquivo público não foi encontrado no Google Drive.', {
      code: 'DRIVE_NOT_FOUND',
      status: 404
    });
  }

  throw new DriveAccessError(
    'O Google Drive não entregou o arquivo como conteúdo público. O link pode estar privado, exigir confirmação adicional ou ter atingido um limite temporário de download.',
    { code: 'DRIVE_PUBLIC_DOWNLOAD_FAILED', status: 502 }
  );
}

export async function probePublicFile(input) {
  const parsed = typeof input === 'string' ? parseGoogleDriveLink(input) : input;
  const response = await fetchPublicFile(parsed.id, {
    resourceKey: parsed.resourceKey,
    range: 'bytes=0-0',
    timeout: 20_000
  });

  const result = {
    id: parsed.id,
    name: parseFilename(response.headers.get('content-disposition') || ''),
    mimeType: (response.headers.get('content-type') || 'application/octet-stream').split(';')[0].trim(),
    size: totalSizeFromHeaders(response.headers),
    sourceUrl: parsed.sourceUrl || '',
    resourceKey: parsed.resourceKey || '',
    verified: true
  };

  await safeCancel(response);
  return result;
}

export async function downloadFileResponse(file, { range } = {}) {
  return fetchPublicFile(file.id, {
    resourceKey: file.resourceKey || '',
    range,
    timeout: 60_000
  });
}

export async function downloadFileBuffer(file, maxBytes) {
  if (file.size && Number(file.size) > maxBytes) {
    throw new DriveAccessError('O arquivo excede o limite de tamanho configurado.', {
      code: 'FILE_TOO_LARGE',
      status: 413
    });
  }

  const response = await fetchPublicFile(file.id, {
    resourceKey: file.resourceKey || '',
    timeout: 60_000
  });

  const contentLength = Number(response.headers.get('content-length') || 0);
  if (contentLength && contentLength > maxBytes) {
    await safeCancel(response);
    throw new DriveAccessError('O arquivo excede o limite de tamanho configurado.', {
      code: 'FILE_TOO_LARGE',
      status: 413
    });
  }

  const chunks = [];
  let total = 0;
  if (!response.body) return { buffer: Buffer.alloc(0), metadata: file };

  const reader = response.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel('file-too-large');
        throw new DriveAccessError('O arquivo excede o limite de tamanho configurado.', {
          code: 'FILE_TOO_LARGE',
          status: 413
        });
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }

  return { buffer: Buffer.concat(chunks, total), metadata: file };
}

export async function proxyThumbnail(file) {
  const url = new URL(PUBLIC_THUMBNAIL_BASE);
  url.searchParams.set('id', file.id);
  url.searchParams.set('sz', 'w600');
  if (file.resourceKey) url.searchParams.set('resourcekey', file.resourceKey);

  let response;
  try {
    response = await fetch(url, {
      redirect: 'follow',
      headers: { 'User-Agent': 'HQ-Reader/1.1' },
      signal: AbortSignal.timeout(15_000)
    });
  } catch {
    return null;
  }

  if (!response.ok || looksLikeHtml(response)) {
    await safeCancel(response);
    return null;
  }
  return response;
}
