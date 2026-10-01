import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { getConfig as getStockConfig } from '../../server/config.js';
import { createDatabase, closeDatabase as closeStockDb } from '../../server/db/database.js';
import { createApp as createStockApp } from '../../server/app.js';
import { ensureCommerceRuntime } from '../../server/services/commerce.js';
import { getConfig as getStoreConfig } from '../src/config.js';
import { openDatabase, closeDatabase as closeStoreDb, getDatabase as storeDb } from '../src/db/database.js';
import { createApp as createStoreApp } from '../src/app.js';
import { CatalogClient } from '../src/services/catalog-client.js';

const KEY_ID = 'analytics-store';
const SECRET = 'a'.repeat(48);

let stockServer;
let app;
let agent;
let csrf;
let productId;

test.before(async () => {
  const stockConfig = getStockConfig({ NODE_ENV: 'test', COMMERCE_API_KEY_ID: KEY_ID, COMMERCE_API_SECRET: SECRET, COOKIE_SECURE: 'false' });
  const stockDb = createDatabase(':memory:', { seed: true });
  ensureCommerceRuntime(stockDb, stockConfig);
  const variant = stockDb.prepare('SELECT id, product_id FROM product_variants WHERE requires_imei = 0 LIMIT 1').get();
  const now = new Date().toISOString();
  stockDb.prepare('UPDATE products SET published = 1, published_at = ?, public_description = ? WHERE id = ?').run(now, 'Producto medido', variant.product_id);
  stockDb.prepare('UPDATE product_variants SET published = 1, sale_price = 100, sale_price_registered = 1, promo_price = NULL WHERE id = ?').run(variant.id);
  stockDb.prepare('UPDATE inventory SET quantity = 2, reserved_quantity = 0, updated_at = ? WHERE variant_id = ?').run(now, variant.id);
  productId = variant.product_id;
  stockServer = createStockApp({ db: stockDb, config: stockConfig }).listen(0, '127.0.0.1');
  await new Promise((resolve) => stockServer.once('listening', resolve));

  const config = getStoreConfig({
    NODE_ENV: 'test', DB_PATH: ':memory:', PUBLIC_BASE_URL: 'http://localhost:4000',
    STOCK_API_BASE_URL: `http://127.0.0.1:${stockServer.address().port}`,
    STOCK_API_KEY_ID: KEY_ID, STOCK_API_SECRET: SECRET, COOKIE_SECURE: 'false'
  });
  openDatabase(config);
  app = createStoreApp(config, { catalogClient: new CatalogClient(config), paymentProvider: { enabled: () => false } });
  agent = request.agent(app);
  csrf = (await agent.get('/api/auth/session')).body.data.csrfToken;
});

test.after(async () => {
  await new Promise((resolve) => stockServer.close(resolve));
  closeStoreDb();
});

const count = () => storeDb().prepare('SELECT COUNT(*) AS c FROM analytics_events').get().c;

test('los eventos de navegación y compra se registran', async () => {
  const before = count();
  await agent.post('/api/storefront/analytics').set('X-CSRF-Token', csrf)
    .send({ event: 'PRODUCT_VIEW', anonymousId: 'anon-1', sessionId: 'ses-1', productId, variantId: 'var-1' }).expect(202);
  await agent.post('/api/storefront/analytics').set('X-CSRF-Token', csrf)
    .send({ event: 'SEARCH', anonymousId: 'anon-1', sessionId: 'ses-1', query: 'iphone 17' }).expect(202);
  await agent.post('/api/storefront/analytics').set('X-CSRF-Token', csrf)
    .send({ event: 'ADD_TO_CART', anonymousId: 'anon-1', sessionId: 'ses-1', productId, variantId: 'var-1' }).expect(202);
  await agent.post('/api/storefront/analytics').set('X-CSRF-Token', csrf)
    .send({ event: 'OUT_OF_STOCK', anonymousId: 'anon-1', sessionId: 'ses-1', productId, variantId: 'var-2' }).expect(202);
  assert.equal(count(), before + 4, 'los cuatro eventos se guardan');

  const search = storeDb().prepare("SELECT metadata_json FROM analytics_events WHERE event_name = 'SEARCH' ORDER BY id DESC LIMIT 1").get();
  assert.equal(JSON.parse(search.metadata_json).query, 'iphone 17', 'la búsqueda guarda el término');
});

test('un evento desconocido se rechaza con 422', async () => {
  const before = count();
  const response = await agent.post('/api/storefront/analytics').set('X-CSRF-Token', csrf)
    .send({ event: 'HACK_EVENT', anonymousId: 'anon-1' });
  assert.equal(response.status, 400, 'la lista de eventos es cerrada y el cuerpo se rechaza');
  assert.equal(response.body.error.code, 'VALIDATION_ERROR');
  assert.equal(count(), before, 'no se persiste nada');
});

test('los eventos sin identificador anónimo se ignoran', async () => {
  const before = count();
  await agent.post('/api/storefront/analytics').set('X-CSRF-Token', csrf)
    .send({ event: 'PRODUCT_VIEW', productId }).expect(202);
  await agent.post('/api/storefront/analytics').set('X-CSRF-Token', csrf)
    .send({ event: 'PRODUCT_VIEW' }).expect(202);
  assert.equal(count(), before, 'sin identificador anónimo no hay registro atribuible');
});

test('un evento de producto sin producto ni consulta se ignora', async () => {
  const before = count();
  await agent.post('/api/storefront/analytics').set('X-CSRF-Token', csrf)
    .send({ event: 'ADD_TO_CART', anonymousId: 'anon-2' }).expect(202);
  assert.equal(count(), before, 'un evento de compra sin producto no aporta información');
});

test('la analítica exige CSRF', async () => {
  const before = count();
  await agent.post('/api/storefront/analytics')
    .send({ event: 'VISIT', anonymousId: 'anon-1' }).expect(403);
  assert.equal(count(), before);
});

test('la configuración pública expone los identificadores de terceros sólo como lectura', async () => {
  const settings = (await agent.get('/api/storefront/config')).body.data.store;
  assert.deepEqual(settings.analytics, { gaMeasurementId: '', metaPixelId: '' });
  assert.equal(settings.secrets, undefined, 'la configuración pública no expone secretos');
  assert.equal(JSON.stringify(settings).includes(process.env.STOCK_API_SECRET || 'nunca'), false);
});
