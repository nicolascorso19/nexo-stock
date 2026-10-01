/**
 * NEXO · pila de DESARROLLO
 *
 * Levanta los dos sistemas contra la base de desarrollo (data/nexo-dev.sqlite)
 * con los datos ficticios visibles, para poder revisar la tienda completa.
 *
 * El stock privado corre como proceso hijo en :3000 y la tienda en :4000.
 * Las credenciales HMAC se generan en memoria y se pasan por entorno: nunca
 * se escriben en un archivo ni se imprimen.
 */
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createDatabase, closeDatabase } from '../server/db/database.js';
import { ensureCommerceRuntime } from '../server/services/commerce.js';
import { getConfig } from '../server/config.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const keyId = `dev-store-${crypto.randomBytes(4).toString('hex')}`;
const secret = crypto.randomBytes(32).toString('hex');
const stockPort = Number(process.env.DEV_STOCK_PORT || 3100);
const storePort = Number(process.env.DEV_STORE_PORT || 4100);

const stockConfig = getConfig({
  NODE_ENV: 'development',
  DB_PATH: 'data/nexo-dev.sqlite',
  SEED_DEMO: 'true',
  COMMERCE_INCLUDE_FICTIONAL: 'true',
  COMMERCE_API_KEY_ID: keyId,
  COMMERCE_API_SECRET: secret,
  COMMERCE_WEBHOOKS_ENABLED: 'false',
  COOKIE_SECURE: 'false',
  HOST: '127.0.0.1',
  PORT: String(stockPort)
});

if (!stockConfig.includeFictional) {
  console.error('La pila de desarrollo necesita COMMERCE_INCLUDE_FICTIONAL=true.');
  process.exit(1);
}

// La clave de integración se registra en la base de desarrollo para que la
// tienda pueda autenticarse. Es una clave descartable de un solo proceso.
const db = createDatabase(stockConfig.dbPath, { seed: false });
ensureCommerceRuntime(db, stockConfig);
closeDatabase(db);

const common = {
  ...process.env,
  PATH: process.env.PATH,
  SystemRoot: process.env.SystemRoot
};

const children = [];
function start(name, script, cwd, env, color) {
  const child = spawn(process.execPath, [script], { cwd, env: { ...common, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  const prefix = `\u001b[${color}m[${name}]\u001b[0m`;
  const pipe = (stream, target) => stream.on('data', (chunk) => {
    for (const line of String(chunk).split('\n')) if (line.trim()) target(`${prefix} ${line}`);
  });
  pipe(child.stdout, console.log);
  pipe(child.stderr, console.error);
  child.on('exit', (code) => console.log(`${prefix} terminó con código ${code}`));
  children.push(child);
  return child;
}

// Rutas absolutas para que ambos procesos abran exactamente las mismas bases,
// sin importar el directorio de trabajo desde el que arrancan.
const stockDbPath = process.env.STOCK_DB_PATH
  ? path.resolve(rootDir, process.env.STOCK_DB_PATH)
  : path.join(rootDir, 'data', 'nexo-dev.sqlite');
const storeDbPath = process.env.STORE_DB_PATH
  ? path.resolve(rootDir, process.env.STORE_DB_PATH)
  : path.join(rootDir, 'ecommerce', 'data', 'nexo-store-dev.sqlite');

start('stock', path.join(rootDir, 'server/index.js'), rootDir, {
  NODE_ENV: 'development',
  DB_PATH: stockDbPath,
  SEED_DEMO: 'true',
  COMMERCE_INCLUDE_FICTIONAL: 'true',
  COMMERCE_API_KEY_ID: keyId,
  COMMERCE_API_SECRET: secret,
  COMMERCE_WEBHOOKS_ENABLED: 'false',
  COOKIE_SECURE: 'false',
  HOST: '127.0.0.1',
  PORT: String(stockPort)
}, '36');

start('store', path.join(rootDir, 'ecommerce/src/index.js'), path.join(rootDir, 'ecommerce'), {
  NODE_ENV: 'development',
  PORT: String(storePort),
  HOST: '127.0.0.1',
  PUBLIC_BASE_URL: `http://localhost:${storePort}`,
  COOKIE_SECURE: 'false',
  STOCK_API_BASE_URL: `http://127.0.0.1:${stockPort}`,
  STOCK_API_KEY_ID: keyId,
  STOCK_API_SECRET: secret,
  STOCK_WEBHOOKS_ENABLED: 'false',
  MERCADOPAGO_ENABLED: 'false',
  DB_PATH: storeDbPath
}, '35');

// Usuario de la tienda para revisar el panel de pedidos. Las credenciales son
// fijas y sólo existen en la base de desarrollo: en producción se crea con
// `npm run admin:create` y una contraseña elegida por el dueño del negocio.
const devAdmin = { name: 'Administrador de desarrollo', email: 'dev-admin@nexo.local', password: 'nexo-dev-admin-2026' };
// En Windows los import() dinámicos necesitan una URL file://, no una ruta.
const asUrl = (relative) => pathToFileURL(path.join(rootDir, relative)).href;
const { openDatabase, closeDatabase: closeStoreDb } = await import(asUrl('ecommerce/src/db/database.js'));
const { createAdminUser } = await import(asUrl('ecommerce/src/services/auth.js'));
const { getConfig: getStoreConfig } = await import(asUrl('ecommerce/src/config.js'));
const storeConfig = getStoreConfig({
  NODE_ENV: 'development',
  DB_PATH: storeDbPath,
  PUBLIC_BASE_URL: `http://localhost:${storePort}`,
  STOCK_API_BASE_URL: `http://127.0.0.1:${stockPort}`,
  STOCK_API_KEY_ID: keyId,
  STOCK_API_SECRET: secret
});
openDatabase(storeConfig);
try {
  await createAdminUser(devAdmin);
} catch {
  // El usuario ya existía: se sigue usando la misma cuenta de desarrollo.
}
// Habilita retiro y medios de pago locales para poder recorrer el checkout.
// Son preferencias de la tienda, no datos de stock: no afectan el inventario.
const storeDb = (await import(asUrl('ecommerce/src/db/database.js'))).getDatabase();
storeDb.prepare(`UPDATE store_config SET pickup_enabled = 1, shipping_enabled = 1, transfer_enabled = 1, cash_enabled = 1,
  bank_name = 'Banco de Córdoba', bank_alias = 'nexo.dev.almacen', bank_holder = 'NEXO Development',
  address_locality = 'Córdoba Capital', whatsapp = '+54 9 351 000 0000' WHERE id = 1`).run();
closeStoreDb();

console.log(`  Panel de la tienda:  http://localhost:${storePort}/admin  (${devAdmin.email})`);

console.log('');
console.log('  Pila de DESARROLLO (datos MOCK)');
console.log(`  Stock privado: http://127.0.0.1:${stockPort}`);
console.log(`  Tienda:        http://localhost:${storePort}`);
console.log(`  Base de stock:      ${stockDbPath}`);
console.log(`  Base de la tienda:  ${storeDbPath}`);
console.log('  La base real (data/nexo.sqlite) no se toca.');
console.log('  Ctrl+C para detener.');
console.log('');

function shutdown() {
  for (const child of children) child.kill();
  setTimeout(() => process.exit(0), 500);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
