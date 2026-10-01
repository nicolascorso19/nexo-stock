import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function bool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return /^(1|true|yes|on)$/i.test(String(value).trim());
}

function int(value, fallback, { min, max, name }) {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${name} debe ser un entero entre ${min} y ${max}.`);
  }
  return parsed;
}

function absolute(value, fallback) {
  const candidate = String(value || fallback).trim();
  if (candidate === ':memory:') return candidate;
  return path.isAbsolute(candidate) ? candidate : path.resolve(process.cwd(), candidate);
}

function requiredSecret(value, name, production) {
  const secret = String(value || '').trim();
  if (!secret && production) throw new Error(`${name} es obligatorio en producción.`);
  if (secret && secret.length < 32) throw new Error(`${name} debe tener al menos 32 caracteres.`);
  return secret;
}

export function getConfig(env = process.env) {
  const nodeEnv = env.NODE_ENV || 'development';
  const production = nodeEnv === 'production';
  const dataDir = absolute(env.DATA_DIR, path.join(rootDir, 'data'));
  const publicBaseUrl = String(env.PUBLIC_BASE_URL || 'http://localhost:4000').replace(/\/$/, '');
  const mercadoPagoEnabled = bool(env.MERCADOPAGO_ENABLED, false);
  if (production && !publicBaseUrl.startsWith('https://')) throw new Error('PUBLIC_BASE_URL debe usar HTTPS en producción.');
  if (production && !bool(env.COOKIE_SECURE, true)) throw new Error('COOKIE_SECURE=true es obligatorio en producción.');
  if (production && mercadoPagoEnabled && (!String(env.MERCADOPAGO_ACCESS_TOKEN || '').trim() || !String(env.MERCADOPAGO_WEBHOOK_SECRET || '').trim())) throw new Error('Mercado Pago requiere ACCESS_TOKEN y WEBHOOK_SECRET en producción.');

  const stockWebhooksEnabled = bool(env.STOCK_WEBHOOKS_ENABLED, false);
  return Object.freeze({
    rootDir,
    nodeEnv,
    production,
    host: env.HOST || '0.0.0.0',
    port: int(env.PORT, 4000, { min: 1, max: 65535, name: 'PORT' }),
    trustProxy: int(env.TRUST_PROXY, 0, { min: 0, max: 10, name: 'TRUST_PROXY' }),
    dataDir,
    dbPath: absolute(env.DB_PATH, path.join(dataDir, 'nexo-store.sqlite')),
    publicBaseUrl,
    cookieSecure: bool(env.COOKIE_SECURE, production),
    sessionTtlMs: int(env.SESSION_TTL_HOURS, 168, { min: 1, max: 24 * 365, name: 'SESSION_TTL_HOURS' }) * 60 * 60 * 1000,
    cartTtlMs: int(env.CART_TTL_HOURS, 72, { min: 1, max: 24 * 30, name: 'CART_TTL_HOURS' }) * 60 * 60 * 1000,
    reservationMinutes: int(env.RESERVATION_MINUTES, 10, { min: 2, max: 60, name: 'RESERVATION_MINUTES' }),
    stockApi: Object.freeze({
      baseUrl: String(env.STOCK_API_BASE_URL || 'http://localhost:3000').replace(/\/$/, ''),
      keyId: String(env.STOCK_API_KEY_ID || 'nexo-store-local'),
      secret: requiredSecret(env.STOCK_API_SECRET, 'STOCK_API_SECRET', production),
      timeoutMs: int(env.STOCK_API_TIMEOUT_MS, 5000, { min: 500, max: 30000, name: 'STOCK_API_TIMEOUT_MS' })
    }),
    mercadoPago: Object.freeze({
      enabled: bool(env.MERCADOPAGO_ENABLED, false),
      accessToken: String(env.MERCADOPAGO_ACCESS_TOKEN || '').trim(),
      webhookSecret: String(env.MERCADOPAGO_WEBHOOK_SECRET || '').trim(),
      successUrl: String(env.MERCADOPAGO_SUCCESS_URL || `${publicBaseUrl}/pedido/confirmacion`),
      pendingUrl: String(env.MERCADOPAGO_PENDING_URL || `${publicBaseUrl}/pedido/confirmacion`),
      failureUrl: String(env.MERCADOPAGO_FAILURE_URL || `${publicBaseUrl}/checkout`)
    }),
    smtp: Object.freeze({
      host: String(env.SMTP_HOST || '').trim(),
      port: int(env.SMTP_PORT, 587, { min: 1, max: 65535, name: 'SMTP_PORT' }),
      secure: bool(env.SMTP_SECURE, false),
      user: String(env.SMTP_USER || '').trim(),
      password: String(env.SMTP_PASSWORD || ''),
      from: String(env.MAIL_FROM || 'NEXO Store <no-reply@example.invalid>')
    }),
    stockWebhooks: Object.freeze({
      enabled: stockWebhooksEnabled,
      url: String(env.STOCK_WEBHOOK_URL || `${publicBaseUrl}/api/integrations/stock/webhook`),
      keyId: String(env.STOCK_WEBHOOK_KEY_ID || 'nexo-stock-local'),
      secret: stockWebhooksEnabled ? requiredSecret(env.STOCK_WEBHOOK_SECRET, 'STOCK_WEBHOOK_SECRET', production) : String(env.STOCK_WEBHOOK_SECRET || '').trim()
    })
  });
}
