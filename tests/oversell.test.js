/**
 * El carrito nunca puede superar el stock real.
 *
 * Un carrito es una intención de compra, no una reserva: por eso agregar y
 * cambiar cantidades se validan contra el catálogo en vivo. La reserva real
 * ocurre al crear el pedido.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { getConfig as getStockConfig } from '../server/config.js';
import { createDatabase, closeDatabase as closeStockDb } from '../server/db/database.js';
import { createApp as createStockApp } from '../server/app.js';
import { ensureCommerceRuntime } from '../server/services/commerce.js';
import { getConfig as getStoreConfig } from '../ecommerce/src/config.js';
import { openDatabase, closeDatabase as closeStoreDb, getDatabase as storeDb } from '../ecommerce/src/db/database.js';
import { createApp as createStoreApp } from '../ecommerce/src/app.js';
import { CatalogClient } from '../ecommerce/src/services/catalog-client.js';

const KEY_ID = 'cart-stock-store';
const SECRET = 'w'.repeat(48);

let stockDb;
let stockServer;
let agent;
let csrf;
let scarceVariantId;

test.before(async () => {
  const stockConfig = getStockConfig({ NODE_ENV: 'test', COMMERCE_API_KEY_ID: KEY_ID, COMMERCE_API_SECRET: SECRET, COOKIE_SECURE: 'false' });
  stockDb = createDatabase(':memory:', { seed: true });
  ensureCommerceRuntime(stockDb, stockConfig);
  const variant = stockDb.prepare('SELECT id, product_id FROM product_variants WHERE requires_imei = 0 LIMIT 1').get();
  const now = new Date().toISOString();
  stockDb.prepare('UPDATE products SET published = 1, published_at = ?, public_description = ?, public_slug = ? WHERE id = ?')
    .run(now, 'Producto escaso', 'carstock-ultima-unidad', variant.product_id);
  stockDb.prepare('UPDATE product_variants SET published = 1, sale_price = 100, sale_price_registered = 1, promo_price = NULL WHERE id = ?').run(variant.id);
  stockDb.prepare('UPDATE inventory SET quantity = 1, reserved_quantity = 0, updated_at = ? WHERE variant_id = ?').run(now, variant.id);
  scarceVariantId = variant.id;

  const server = createStockApp({ db: stockDb, config: stockConfig }).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  stockServer = server;

  const config = getStoreConfig({
    NODE_ENV: 'test', DB_PATH: ':memory:', PUBLIC_BASE_URL: 'http://localhost:4000',
    STOCK_API_BASE_URL: `http://127.0.0.1:${server.address().port}`,
    STOCK_API_KEY_ID: KEY_ID, STOCK_API_SECRET: SECRET, COOKIE_SECURE: 'false'
  });
  openDatabase(config);
  storeDb().prepare('UPDATE store_config SET pickup_enabled = 1, transfer_enabled = 1 WHERE id = 1').run();
  const app = createStoreApp(config, { catalogClient: new CatalogClient(config), paymentProvider: { enabled: () => false } });
  agent = request.agent(app);
  csrf = (await agent.get('/api/auth/session')).body.data.csrfToken;
});

test.after(async () => {
  await new Promise((resolve) => stockServer.close(resolve));
  closeStockDb(stockDb);
  closeStoreDb();
});

test('agregar más unidades de las disponibles se rechaza con 409', async () => {
  const first = await agent.post('/api/cart/items').set('X-CSRF-Token', csrf).send({ inventoryVariantId: scarceVariantId, quantity: 1 });
  assert.equal(first.status, 201, JSON.stringify(first.body));

  const second = await agent.post('/api/cart/items').set('X-CSRF-Token', csrf).send({ inventoryVariantId: scarceVariantId, quantity: 1 });
  assert.equal(second.status, 409);
  assert.equal(second.body.error.code, 'INSUFFICIENT_STOCK');
  assert.match(second.body.error.message, /disponibilidad|quedan/i);
  assert.equal(second.body.error.details.available, 1);
  assert.equal(second.body.error.details.inCart, 1);
});

test('el carrito vacío puede volver a agregar la unidad si el stock se liberó', async () => {
  const cart = await agent.get('/api/cart');
  const item = cart.body.data.items[0];
  await agent.delete(`/api/cart/items/${item.id}`).set('X-CSRF-Token', csrf).expect(200);
  const again = await agent.post('/api/cart/items').set('X-CSRF-Token', csrf).send({ inventoryVariantId: scarceVariantId, quantity: 1 });
  assert.equal(again.status, 201);
});

test('subir la cantidad por el endpoint de actualización también se valida', async () => {
  // Se libera el stock para tener margen y probar el límite desde el servidor.
  stockDb.prepare('UPDATE inventory SET quantity = 2, updated_at = ? WHERE variant_id = ?').run(new Date().toISOString(), scarceVariantId);
  const item = (await agent.get('/api/cart')).body.data.items[0];
  await agent.patch(`/api/cart/items/${item.id}`).set('X-CSRF-Token', csrf).send({ quantity: 1 }).expect(200);

  const tooMany = await agent.patch(`/api/cart/items/${item.id}`).set('X-CSRF-Token', csrf).send({ quantity: 3 });
  assert.equal(tooMany.status, 409, 'no se puede superar el stock disponible');
  assert.equal(tooMany.body.error.code, 'INSUFFICIENT_STOCK');

  const exact = await agent.patch(`/api/cart/items/${item.id}`).set('X-CSRF-Token', csrf).send({ quantity: 2 });
  assert.equal(exact.status, 200, 'sí se puede llevar exactamente el stock disponible');
});

test('un producto agotado no se puede agregar', async () => {
  stockDb.prepare('UPDATE inventory SET quantity = 0, updated_at = ? WHERE variant_id = ?').run(new Date().toISOString(), scarceVariantId);
  const response = await agent.post('/api/cart/items').set('X-CSRF-Token', csrf).send({ inventoryVariantId: scarceVariantId, quantity: 1 });
  assert.equal(response.status, 409);
  assert.equal(response.body.error.code, 'OUT_OF_STOCK');
});
