/**
 * Levanta SOLO la tienda contra el panel que ya está corriendo.
 *
 * El problema que resuelve: `dev-stack.js` levanta su propio stock en :3100 con
 * la base de desarrollo, así que la tienda en :4100 mostraba un catálogo
 * distinto al del panel en :3000 (productos MOCK, sin los reales). Con este
 * script la tienda habla con la API del panel real y las dos ven lo mismo.
 *
 *   node scripts/dev-store.js
 *
 * Lee el secreto compartido de los mismos .env que usan los dos sistemas, así
 * que la firma HMAC coincide y no hay que inventar claves por proceso.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const storeDir = path.join(rootDir, 'ecommerce');

function readEnv(file) {
  if (!fs.existsSync(file)) return {};
  return Object.fromEntries(
    fs.readFileSync(file, 'utf8').split(/\r?\n/)
      .filter((line) => line.trim() && !line.trim().startsWith('#') && line.includes('='))
      .map((line) => {
        const index = line.indexOf('=');
        return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
      })
  );
}

const stockEnv = readEnv(path.join(rootDir, '.env'));
const storeEnv = readEnv(path.join(storeDir, '.env'));

const stockUrl = process.env.STOCK_API_BASE_URL || 'http://127.0.0.1:3000';
const storePort = Number(process.env.DEV_STORE_PORT || 4100);
const storeDbPath = process.env.STORE_DB_PATH
  ? path.resolve(rootDir, process.env.STORE_DB_PATH)
  : path.join(storeDir, 'data', 'nexo-store.sqlite');

const keyId = storeEnv.STOCK_API_KEY_ID || stockEnv.COMMERCE_API_KEY_ID || '';
const secret = storeEnv.STOCK_API_SECRET || stockEnv.COMMERCE_API_SECRET || '';

if (!keyId || secret.length < 32) {
  console.error('Falta el secreto compartido. Corré ecommerce/src/scripts/setup-local.js o revisá los .env.');
  process.exit(1);
}

const health = await fetch(`${stockUrl}/api/health`).then((response) => response.json()).catch(() => null);
if (!health || health.status !== 'ok') {
  console.error(`El panel no responde en ${stockUrl}. Levantá el panel primero (INICIAR-NEXO.cmd).`);
  process.exit(1);
}

console.log('');
console.log('  NEXO Store (contra el panel real)');
console.log(`  Tienda:  http://localhost:${storePort}`);
console.log(`  Catálogo: http://localhost:${storePort}/catalogo`);
console.log(`  Stock:   ${stockUrl}`);
console.log(`  Base de la tienda: ${path.relative(rootDir, storeDbPath)}`);
console.log('  La base del panel no se toca. Ctrl+C para detener.');
console.log('');

const { spawn } = await import('node:child_process');
const child = spawn(process.execPath, [path.join(storeDir, 'src', 'index.js')], {
  cwd: storeDir,
  env: {
    ...process.env,
    NODE_ENV: 'development',
    PORT: String(storePort),
    HOST: '127.0.0.1',
    PUBLIC_BASE_URL: `http://localhost:${storePort}`,
    COOKIE_SECURE: 'false',
    STOCK_API_BASE_URL: stockUrl,
    STOCK_API_KEY_ID: keyId,
    STOCK_API_SECRET: secret,
    STOCK_WEBHOOKS_ENABLED: 'false',
    MERCADOPAGO_ENABLED: 'false',
    DB_PATH: storeDbPath
  },
  stdio: 'inherit'
});

child.on('exit', (code) => process.exit(code ?? 0));
process.on('SIGINT', () => child.kill());
process.on('SIGTERM', () => child.kill());