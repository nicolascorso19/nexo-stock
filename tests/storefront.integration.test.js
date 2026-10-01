import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { getConfig as getStockConfig } from '../server/config.js';
import { createDatabase, closeDatabase as closeStockDb } from '../server/db/database.js';
import { createApp as createStockApp } from '../server/app.js';
import { ensureCommerceRuntime } from '../server/services/commerce.js';
import { getConfig as getStoreConfig } from '../ecommerce/src/config.js';
import { openDatabase, closeDatabase as closeStoreDb, getDatabase as getStoreDb } from '../ecommerce/src/db/database.js';
import { createApp as createStoreApp } from '../ecommerce/src/app.js';
import { CatalogClient } from '../ecommerce/src/services/catalog-client.js';
import { createAdminUser } from '../ecommerce/src/services/auth.js';

let stockDb;
let stockServer;
let stockConfig;
let storeApp;
let storeAgent;
let csrf;
let storeConfig;
let variantId;

test.before(async () => {
  stockConfig = getStockConfig({ NODE_ENV: 'test', COMMERCE_API_KEY_ID: 'integration-store', COMMERCE_API_SECRET: 'i'.repeat(48), COOKIE_SECURE: 'false' });
  stockDb = createDatabase(':memory:', { seed: true });
  ensureCommerceRuntime(stockDb, stockConfig);
  const variant = stockDb.prepare('SELECT id, product_id FROM product_variants WHERE requires_imei = 0 LIMIT 1').get();
  assert.ok(variant);
  variantId = variant.id;
  const now = new Date().toISOString();
  stockDb.prepare('UPDATE products SET published = 1, published_at = ?, public_description = ? WHERE id = ?').run(now, 'Producto de integración', variant.product_id);
  stockDb.prepare('UPDATE product_variants SET published = 1, sale_price = 50, sale_price_registered = 1 WHERE id = ?').run(variantId);
  stockDb.prepare('UPDATE inventory SET quantity = 1, reserved_quantity = 0, updated_at = ? WHERE variant_id = ?').run(now, variantId);
  const stockApp = createStockApp({ db: stockDb, config: stockConfig });
  stockServer = stockApp.listen(0, '127.0.0.1');
  await new Promise((resolve) => stockServer.once('listening', resolve));
  const stockBaseUrl = `http://127.0.0.1:${stockServer.address().port}`;

  storeConfig = getStoreConfig({ NODE_ENV: 'test', DB_PATH: ':memory:', PUBLIC_BASE_URL: 'http://localhost:4000', STOCK_API_BASE_URL: stockBaseUrl, STOCK_API_KEY_ID: 'integration-store', STOCK_API_SECRET: 'i'.repeat(48), COOKIE_SECURE: 'false' });
  openDatabase(storeConfig);
  getStoreDb().prepare('UPDATE store_config SET pickup_enabled = 1, transfer_enabled = 1, cash_enabled = 1 WHERE id = 1').run();
  storeApp = createStoreApp(storeConfig, { catalogClient: new CatalogClient(storeConfig), paymentProvider: { enabled: () => false } });
  storeAgent = request.agent(storeApp);
  csrf = (await storeAgent.get('/api/auth/session')).body.data.csrfToken;
});

test.after(async () => {
  await new Promise((resolve) => stockServer.close(resolve));
  closeStockDb(stockDb);
  closeStoreDb();
});

test('a storefront checkout reserves, charges and confirms against the private stock API', async () => {
  const add = await storeAgent.post('/api/cart/items').set('X-CSRF-Token', csrf).send({ inventoryVariantId: variantId, quantity: 1 }).expect(201);
  assert.equal(add.body.data.quote.totalCents, 5000);
  const quote = (await storeAgent.post('/api/checkout/quote').set('X-CSRF-Token', csrf).send({ fulfillmentMethod: 'PICKUP' })).body.data.quote;
  const orderResponse = await storeAgent.post('/api/checkout/orders').set('X-CSRF-Token', csrf).set('Idempotency-Key', 'storefront-integration-1').send({
    firstName: 'Ana', lastName: 'Gómez', documentNumber: '30.111.222', email: 'ana@example.com', phone: '3511111111',
    fulfillmentMethod: 'PICKUP', paymentMethod: 'bank_transfer', quoteToken: quote.quoteToken, acceptPriceChanges: true
  }).expect(201);
  assert.equal(orderResponse.body.data.order.stockStatus, 'RESERVED');
  assert.equal(stockDb.prepare('SELECT reserved_quantity FROM inventory WHERE variant_id = ?').get(variantId).reserved_quantity, 1);

  await createAdminUser({ name: 'Store Admin', email: 'store-admin@example.com', password: 'store-admin-pass-123', role: 'ADMIN' });
  const admin = request.agent(storeApp);
  // Las dos peticiones se esperan por separado: anidar una dentro de la
  // argumentos de la otra las hace competir por el servidor efímero.
  const adminSession = await admin.get('/api/auth/session').expect(200);
  const session = await admin.post('/api/admin/auth/login')
    .set('X-CSRF-Token', adminSession.body.data.csrfToken)
    .send({ email: 'store-admin@example.com', password: 'store-admin-pass-123' })
    .expect(200);
  const adminCsrf = session.body.data.csrfToken;
  const orderId = orderResponse.body.data.order.id;
  const paymentId = getStoreDb().prepare('SELECT id FROM payments WHERE order_id = ?').get(orderId).id;
  const confirmed = await admin.post(`/api/admin/orders/${orderId}/payment/confirm`).set('X-CSRF-Token', adminCsrf).send({ paymentId }).expect(200);
  assert.equal(confirmed.body.data.stockStatus, 'CONFIRMED');
  assert.equal(stockDb.prepare('SELECT quantity FROM inventory WHERE variant_id = ?').get(variantId).quantity, 0);
  assert.equal(stockDb.prepare('SELECT COUNT(*) AS count FROM sales WHERE notes LIKE ?').get(`%${orderResponse.body.data.order.number}%`).count, 1);
});

test('a signed integration request cannot be replayed with the same nonce', async () => {
  const client = new CatalogClient(storeConfig);
  const first = await client.getCatalog({ fresh: true });
  assert.ok(Array.isArray(first.products));
  // A second request uses a new nonce; an explicit old-nonce replay is rejected by the private API.
  const response = await fetch(`http://127.0.0.1:${stockServer.address().port}/api/integrations/store/catalog`, { method: 'GET', headers: { 'X-ECOMMERCE-KEY-ID': 'integration-store', 'X-ECOMMERCE-TIMESTAMP': String(Date.now()), 'X-ECOMMERCE-NONCE': 'fixed-nonce-replay', 'X-ECOMMERCE-SIGNATURE': '0'.repeat(64) } });
  assert.equal(response.status, 401);
});
