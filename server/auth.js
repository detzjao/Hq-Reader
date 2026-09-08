import crypto from 'node:crypto';

const DEFAULT_ADMIN_TOKEN = '@detzjao1';

function expectedToken() {
  return DEFAULT_ADMIN_TOKEN;
}

export function isAdminConfigured() {
  return Boolean(expectedToken());
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  if (!left.length || left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

export function verifyAdminToken(value) {
  const expected = expectedToken();
  return Boolean(expected) && safeEqual(expected, String(value || '').trim());
}

export function assertAdminRequest(req) {
  if (!isAdminConfigured()) {
    const error = new Error('A administração da biblioteca não está disponível.');
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
