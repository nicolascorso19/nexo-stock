import 'dotenv/config';
import path from 'node:path';

function booleanFromEnv(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  throw new Error(`Valor booleano inválido: ${value}`);
}

function integerFromEnv(value, fallback, { min, max, name }) {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${name} debe ser un entero entre ${min} y ${max}.`);
  }
  return parsed;
}

function resolvePath(value, fallback) {
  const candidate = String(value || fallback).trim();
  if (candidate === ':memory:') return candidate;
  return path.isAbsolute(candidate) ? candidate : path.resolve(process.cwd(), candidate);
}

export function getConfig(env = process.env) {
  const nodeEnv = env.NODE_ENV || 'development';
  const production = nodeEnv === 'production';
  const dataDir = resolvePath(env.DATA_DIR, './data');
  const dbPath = resolvePath(env.DB_PATH, path.join(dataDir, 'nexo.sqlite'));
  // El seed sólo se habilita explícitamente en desarrollo/test.
  const seedDemo = booleanFromEnv(env.SEED_DEMO, false);
  const cookieSecure = booleanFromEnv(env.COOKIE_SECURE, production);
  if (production && seedDemo) throw new Error('SEED_DEMO no puede habilitarse en producción.');
  if (production && !cookieSecure) throw new Error('COOKIE_SECURE=true es obligatorio en producción.');
  // Los datos ficticios nunca forman parte del catálogo público por defecto. Sólo
  // se exponen para revisar la tienda en desarrollo y el proceso se niega a
  // habilitarlos en producción.
  const includeFictional = booleanFromEnv(env.COMMERCE_INCLUDE_FICTIONAL, false);
  if (production && includeFictional) throw new Error('COMMERCE_INCLUDE_FICTIONAL no puede habilitarse en producción.');

  return Object.freeze({
    nodeEnv,
    isProduction: production,
    host: env.HOST || '0.0.0.0',
    port: integerFromEnv(env.PORT, 3000, { min: 1, max: 65535, name: 'PORT' }),
    trustProxy: integerFromEnv(env.TRUST_PROXY, 0, { min: 0, max: 10, name: 'TRUST_PROXY' }),
    dataDir,
    dbPath,
    seedDemo,
    includeFictional,
    cookieName: env.COOKIE_NAME || 'nexo_session',
    cookieSecure,
    sessionTtlMs: 12 * 60 * 60 * 1000,
    loginRateLimit: integerFromEnv(env.LOGIN_RATE_LIMIT, 10, { min: 1, max: 10000, name: 'LOGIN_RATE_LIMIT' }),
    bcryptRounds: integerFromEnv(env.BCRYPT_ROUNDS, 12, { min: 10, max: 14, name: 'BCRYPT_ROUNDS' }),
    jsonBodyLimit: env.JSON_BODY_LIMIT || '25mb',
    commerceApiKeyId: env.COMMERCE_API_KEY_ID || '',
    commerceApiSecret: env.COMMERCE_API_SECRET || '',
    commerceReservationTtlSeconds: integerFromEnv(env.COMMERCE_RESERVATION_TTL_SECONDS, 600, { min: 60, max: 1800, name: 'COMMERCE_RESERVATION_TTL_SECONDS' }),
    // Por defecto el catálogo firmado sólo publica variantes con precio
    // registrado, porque son las únicas vendibles. Con esta bandera en true se
    // publica también lo que no tiene precio (catálogo visual, "Consultar"),
    // que igual no se puede comprar: el e-commerce responde PRICE_NOT_REGISTERED.
    commercePublishWithoutPrice: booleanFromEnv(env.COMMERCE_PUBLISH_WITHOUT_PRICE, false),
    // La web pública es la tienda del puerto 4100, no un catálogo propio.
    // /public y /public.html redirigen acá para que los enlaces old del panel sigan sirviendo.
    storefrontUrl: env.STOREFRONT_URL || 'http://127.0.0.1:4100/',
    // El catalogo no publica precios: cada producto se consulta por WhatsApp.
    // Numero en formato internacional, solo digitos (wa.me no acepta + ni espacios).
    whatsapp: String(env.WHATSAPP || '543517507501').replace(/[^\d]/g, ''),
    commerceWebhooksEnabled: booleanFromEnv(env.COMMERCE_WEBHOOKS_ENABLED, false),
    commerceWebhookUrl: env.COMMERCE_WEBHOOK_URL || '',
    commerceWebhookKeyId: env.COMMERCE_WEBHOOK_KEY_ID || '',
    commerceWebhookSecret: env.COMMERCE_WEBHOOK_SECRET || ''
  });
}
