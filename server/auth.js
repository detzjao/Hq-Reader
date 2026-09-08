import crypto from 'node:crypto';

export function isAdminConfigured() {
  return Boolean(String(process.env.HQ_READER_ADMIN_TOKEN || '').trim());
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  if (!left.length || left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

export function verifyAdminToken(value) {
  const expected = String(process.env.HQ_READER_ADMIN_TOKEN || '').trim();
  return Boolean(expected) && safeEqual(expected, String(value || '').trim());
}

export function assertAdminRequest(req) {
  if (!isAdminConfigured()) {
    const error = new Error('Defina HQ_READER_ADMIN_TOKEN no projeto Vercel para habilitar alterações na biblioteca.');
    error.code = 'ADMIN_NOT_CONFIGURED';
    error.status = 503;
    throw error;
  }
  const supplied = req.headers?.['x-admin-token'] || req.query?.adminToken || '';
  if (!verifyAdminToken(supplied)) {
    const error = new Error('Senha de administração inválida.');
    error.code = 'ADMIN_UNAUTHORIZED';
    error.status = 401;
    throw error;
  }
}
