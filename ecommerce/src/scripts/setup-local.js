/**
 * Configuración local de la integración.
 *
 *   node ecommerce/src/scripts/setup-local.js
 *
 * Genera el secreto compartido que usan los dos sistemas y lo escribe en los
 * dos archivos de entorno con permisos restrictivos. No imprime ningún secreto
 * ni sobrescribe valores que ya existan: sólo completa lo que falta.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const stockEnvFile = path.join(root, '.env');
const storeEnvFile = path.join(root, 'ecommerce', '.env');

function readEnv(file) {
  if (!fs.existsSync(file)) return {};
  return Object.fromEntries(fs.readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .filter((line) => line && !line.trim().startsWith('#') && line.includes('='))
    .map((line) => {
      const index = line.indexOf('=');
      return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
    }));
}

function writeEnv(file, values) {
  fs.writeFileSync(file, `${Object.entries(values).map(([key, value]) => `${key}=${value}`).join('\n')}\n`, { mode: 0o600 });
}

const secret = () => crypto.randomBytes(32).toString('base64url');
const longEnough = (value) => typeof value === 'string' && value.length >= 32;

const stock = readEnv(stockEnvFile);
const store = readEnv(storeEnvFile);

// Un único secreto para los dos lados: la tienda nunca inventa el suyo.
const keyId = stock.COMMERCE_API_KEY_ID || store.STOCK_API_KEY_ID || 'nexo-store-local';
const sharedSecret = longEnough(stock.COMMERCE_API_SECRET) ? stock.COMMERCE_API_SECRET : longEnough(store.STOCK_API_SECRET) ? store.STOCK_API_SECRET : secret();
const webhookSecret = longEnough(stock.COMMERCE_WEBHOOK_SECRET) ? stock.COMMERCE_WEBHOOK_SECRET : longEnough(store.STOCK_WEBHOOK_SECRET) ? store.STOCK_WEBHOOK_SECRET : secret();

Object.assign(stock, {
  NODE_ENV: stock.NODE_ENV || 'development',
  HOST: stock.HOST || '127.0.0.1',
  PORT: stock.PORT || '3000',
  COOKIE_SECURE: stock.COOKIE_SECURE || 'false',
  SEED_DEMO: stock.SEED_DEMO || 'false',
  COMMERCE_API_KEY_ID: keyId,
  COMMERCE_API_SECRET: sharedSecret,
  COMMERCE_RESERVATION_TTL_SECONDS: stock.COMMERCE_RESERVATION_TTL_SECONDS || '600',
  COMMERCE_WEBHOOKS_ENABLED: stock.COMMERCE_WEBHOOKS_ENABLED || 'false',
  COMMERCE_WEBHOOK_URL: stock.COMMERCE_WEBHOOK_URL || 'http://localhost:4000/api/integrations/stock/webhook',
  COMMERCE_WEBHOOK_KEY_ID: stock.COMMERCE_WEBHOOK_KEY_ID || 'nexo-stock-local',
  COMMERCE_WEBHOOK_SECRET: webhookSecret
});

Object.assign(store, {
  NODE_ENV: store.NODE_ENV || 'development',
  HOST: store.HOST || '127.0.0.1',
  PORT: store.PORT || '4000',
  PUBLIC_BASE_URL: store.PUBLIC_BASE_URL || 'http://localhost:4000',
  COOKIE_SECURE: store.COOKIE_SECURE || 'false',
  STOCK_API_BASE_URL: store.STOCK_API_BASE_URL || 'http://localhost:3000',
  STOCK_API_KEY_ID: keyId,
  STOCK_API_SECRET: sharedSecret,
  STOCK_WEBHOOKS_ENABLED: 'false',
  STOCK_WEBHOOK_URL: store.STOCK_WEBHOOK_URL || 'http://localhost:4000/api/integrations/stock/webhook',
  STOCK_WEBHOOK_KEY_ID: store.STOCK_WEBHOOK_KEY_ID || 'nexo-stock-local',
  STOCK_WEBHOOK_SECRET: webhookSecret,
  MERCADOPAGO_ENABLED: store.MERCADOPAGO_ENABLED || 'false',
  SMTP_HOST: store.SMTP_HOST || ''
});

writeEnv(stockEnvFile, stock);
writeEnv(storeEnvFile, store);

console.log('Configuración local lista.');
console.log('Los secretos se generaron y no se imprimieron. Ambos archivos quedaron con permisos restringidos.');
console.log('');
console.log('Siguientes pasos:');
console.log('  npm run admin:create   # primer usuario del sistema de stock');
console.log('  cd ecommerce && npm run admin:create   # primer usuario de la tienda');
console.log('  INICIAR-NEXO.cmd  /  INICIAR-STORE.cmd');
