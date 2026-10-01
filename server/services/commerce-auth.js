import crypto from 'node:crypto';
import { AppError } from '../errors.js';
import { nowIso, sha256 } from '../utils.js';

function canonical({ method, pathname, timestamp, nonce, body }) {
  return [String(method).toUpperCase(), pathname, timestamp, nonce, sha256(body || '')].join('\n');
}

export function commerceAuth(db, config) {
  return (request, _response, next) => {
    try {
      if (!config.commerceApiKeyId || !config.commerceApiSecret) throw new AppError(503, 'COMMERCE_NOT_CONFIGURED', 'La integración de e-commerce no está configurada.');
      const keyId = request.get('X-ECOMMERCE-KEY-ID');
      const signature = request.get('X-ECOMMERCE-SIGNATURE');
      const timestamp = request.get('X-ECOMMERCE-TIMESTAMP');
      const nonce = request.get('X-ECOMMERCE-NONCE');
      if (!keyId || !signature || !timestamp || !nonce) throw new AppError(401, 'INVALID_INTEGRATION_SIGNATURE', 'Firma de integración inválida.');
      if (keyId !== config.commerceApiKeyId) throw new AppError(401, 'INVALID_INTEGRATION_KEY', 'Credencial de integración inválida.');
      const timestampNumber = Number(timestamp);
      if (!Number.isFinite(timestampNumber) || Math.abs(Date.now() - timestampNumber) > 5 * 60 * 1000) throw new AppError(401, 'INTEGRATION_SIGNATURE_EXPIRED', 'La firma expiró.');
      const pathname = request.originalUrl.split('?')[0];
      const expected = crypto.createHmac('sha256', config.commerceApiSecret).update(canonical({ method: request.method, pathname, timestamp, nonce, body: request.rawBody })).digest('hex');
      const left = Buffer.from(signature);
      const right = Buffer.from(expected);
      if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) throw new AppError(401, 'INVALID_INTEGRATION_SIGNATURE', 'Firma de integración inválida.');
      const client = db.prepare('SELECT * FROM service_clients WHERE key_id = ? AND active = 1').get(keyId);
      if (!client || client.secret_hash !== sha256(config.commerceApiSecret)) throw new AppError(401, 'INVALID_INTEGRATION_KEY', 'Credencial de integración inválida.');
      try {
        db.prepare('INSERT INTO commerce_nonces (client_id, nonce, seen_at) VALUES (?, ?, ?)').run(client.id, nonce, nowIso());
      } catch (error) {
        if (String(error.code).includes('CONSTRAINT')) throw new AppError(409, 'REPLAYED_INTEGRATION_REQUEST', 'La solicitud ya fue procesada.');
        throw error;
      }
      const scopes = parseScopes(client.scopes_json);
      request.integrationClient = { id: client.id, name: client.name, keyId: client.key_id, scopes };
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function requireCommerceScope(request, scope) {
  if (!request.integrationClient?.scopes.includes(scope) && !request.integrationClient?.scopes.includes('*')) throw new AppError(403, 'INTEGRATION_SCOPE_REQUIRED', 'El servicio no tiene permiso para esta operación.');
}

function parseScopes(value) {
  try { const parsed = JSON.parse(value || '[]'); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
}

export function ensureConfiguredCommerceClient(db, config) {
  if (!config.commerceApiKeyId || !config.commerceApiSecret) return null;
  const now = nowIso();
  const clientId = `service_${sha256(config.commerceApiKeyId).slice(0, 20)}`;
  const existing = db.prepare('SELECT * FROM service_clients WHERE key_id = ?').get(config.commerceApiKeyId);
  if (!existing) {
    db.prepare(`INSERT INTO service_clients (id, name, key_id, secret_hash, scopes_json, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)`)
      .run(clientId, 'NEXO Store', config.commerceApiKeyId, sha256(config.commerceApiSecret), JSON.stringify(['*']), now, now);
  }
  return db.prepare('SELECT * FROM service_clients WHERE key_id = ?').get(config.commerceApiKeyId);
}
