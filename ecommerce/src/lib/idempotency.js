import { createHash, randomUUID } from 'node:crypto';
import { getDatabase } from '../db/database.js';
import { AppError } from './errors.js';

export function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

export function requestHash(value) {
  return createHash('sha256').update(stableJson(value)).digest('hex');
}

export function requireIdempotencyKey(req) {
  const key = String(req.get('Idempotency-Key') || req.body?.idempotencyKey || '').trim();
  if (!/^[A-Za-z0-9._:-]{8,120}$/.test(key)) throw new AppError('Se requiere una clave de idempotencia válida.', { status: 400, code: 'IDEMPOTENCY_KEY_REQUIRED' });
  return key;
}

export function withIdempotency(scope, key, payload, work, { ttlMs = 24 * 60 * 60 * 1000 } = {}) {
  const db = getDatabase();
  const hash = requestHash(payload);
  const now = new Date();
  const expires = new Date(now.getTime() + ttlMs).toISOString();
  const run = db.transaction(() => {
    const existing = db.prepare('SELECT * FROM idempotency_records WHERE scope = ? AND idempotency_key = ?').get(scope, key);
    if (existing) {
      if (existing.request_hash !== hash) throw new AppError('La clave de idempotencia ya fue usada con otra solicitud.', { status: 409, code: 'IDEMPOTENCY_CONFLICT' });
      return { replay: true, status: existing.response_status || 200, body: existing.response_json ? JSON.parse(existing.response_json) : null };
    }
    db.prepare('INSERT INTO idempotency_records (scope, idempotency_key, request_hash, expires_at) VALUES (?, ?, ?, ?)').run(scope, key, hash, expires);
    const result = work();
    const responseStatus = result?.status || 200;
    const responseBody = result?.body ?? result;
    db.prepare('UPDATE idempotency_records SET response_status = ?, response_json = ? WHERE scope = ? AND idempotency_key = ?').run(responseStatus, JSON.stringify(responseBody), scope, key);
    return { replay: false, status: responseStatus, body: responseBody };
  });
  return run();
}

export function newOrderNumber() {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  return `ORD-${stamp}-${randomUUID().slice(0, 6).toUpperCase()}`;
}
