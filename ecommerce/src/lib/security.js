import crypto from 'node:crypto';
import { AppError } from './errors.js';

export function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

export function hashToken(value) {
  return sha256(value);
}

export function safeEqual(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

export function requestId() {
  return crypto.randomUUID();
}

export function canonicalRequest({ method, pathname, timestamp, nonce, body }) {
  return [String(method).toUpperCase(), pathname, timestamp, nonce, sha256(body || '')].join('\n');
}

export function signRequest({ method, pathname, timestamp, nonce, body, keyId, secret }) {
  const payload = canonicalRequest({ method, pathname, timestamp, nonce, body });
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

export function verifySignedRequest({ method, pathname, timestamp, nonce, body, signature, keyId, expectedKeyId, secret, toleranceMs = 300000 }) {
  if (!keyId || !signature || !timestamp || !nonce) throw new AppError('Firma de integración inválida.', { status: 401, code: 'INVALID_INTEGRATION_SIGNATURE' });
  if (expectedKeyId && !safeEqual(keyId, expectedKeyId)) throw new AppError('Credencial de integración inválida.', { status: 401, code: 'INVALID_INTEGRATION_KEY' });
  const numericTimestamp = Number(timestamp);
  if (!Number.isFinite(numericTimestamp) || Math.abs(Date.now() - numericTimestamp) > toleranceMs) throw new AppError('La firma expiró.', { status: 401, code: 'INTEGRATION_SIGNATURE_EXPIRED' });
  const expected = signRequest({ method, pathname, timestamp, nonce, body, keyId, secret });
  if (!safeEqual(expected, signature)) throw new AppError('Firma de integración inválida.', { status: 401, code: 'INVALID_INTEGRATION_SIGNATURE' });
  return true;
}

export function hashIp(ip, secret) {
  return ip ? sha256(`${secret}:${ip}`) : '';
}

export function maskEmail(value) {
  const [name, domain] = String(value || '').split('@');
  if (!domain) return '';
  return `${name.slice(0, 2)}***@${domain}`;
}

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
}
