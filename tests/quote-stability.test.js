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

const KEY_ID = 'quote-hash-store';
const SECRET = 'h'.repeat(48);

let stockServer;
let stockDb;
let app;
let agent;
let csrf;
let variantId;

test.before(async () => {
  const stockConfig = getStockConfig({ NODE_ENV: 'test', COMMERCE_API_KEY_ID: KEY_ID, COMMERCE_API_SECRET: SECRET, COOKIE_SECURE: 'false' });
  stockDb = createDatabase(':memory:', { seed: true });
  ensureCommerceRuntime(stockDb, stockConfig);
  const variant = stockDb.prepare('SELECT id, product_id FROM product_variants WHERE requires_imei = 0 LIMIT 1').get();
  const now = new Date().toISOString();
  stockDb.prepare('UPDATE products SET published = 1, published_at = ?, public_description = ? WHERE id = ?').run(now, 'Producto de cotización', variant.product_id);
  stockDb.prepare('UPDATE product_variants SET published = 1, sale_price = 750, sale_price_registered = 1, promo_price = NULL WHERE id = ?').run(variant.id);
  stockDb.prepare('UPDATE inventory SET quantity = 5, reserved_quantity = 0, updated_at = ? WHERE variant_id = ?').run(now, variant.id);
  variantId = variant.id;
  stockServer = createStockApp({ db: stockDb, config: stockConfig }).listen(0, '127.0.0.1');
  await new Promise((resolve) => stockServer.once('listening', resolve));

  const config = getStoreConfig({
    NODE_ENV: 'test', DB_PATH: ':memory:', PUBLIC_BASE_URL: 'http://localhost:4000',
    STOCK_API_BASE_URL: `http://127.0.0.1:${stockServer.address().port}`,
    STOCK_API_KEY_ID: KEY_ID, STOCK_API_SECRET: SECRET, COOKIE_SECURE: 'false'
  });
  openDatabase(config);
  storeDb().prepare('UPDATE store_config SET pickup_enabled = 1, transfer_enabled = 1 WHERE id = 1').run();
  app = createStoreApp(config, { catalogClient: new CatalogClient(config), paymentProvider: { enabled: () => false } });
  agent = request.agent(app);
  csrf = (await agent.get('/api/auth/session')).body.data.csrfToken;
  await agent.post('/api/cart/items').set('X-CSRF-Token', csrf).send({ inventoryVariantId: variantId, quantity: 1 });
});

test.after(async () => {
  await new Promise((resolve) => stockServer.close(resolve));
  closeStoreDb();
});

const quote = async () => (await agent.post('/api/checkout/quote').set('X-CSRF-Token', csrf).send({ fulfillmentMethod: 'PICKUP' })).body.data.quote;

/**
 * La huella de la cotización se compara en el navegador para avisar "el precio
 * cambió". Si varied entre consultas, el aviso saldría siempre y el cliente
 * nunca podría confirmar el pedido.
 */
test('la huella de la cotización es estable entre consultas con el mismo contenido', async () => {
  const first = await quote();
  const second = await quote();
  assert.equal(first.quoteHash, second.quoteHash, 'el mismo contenido comercial debe dar la misma huella');
  assert.equal(first.totalCents, second.totalCents);
  assert.notEqual(first.stock.verifiedAt, second.stock.verifiedAt, 'el momento de verificación sí cambia');
});

test('el token firmado cambia aunque la huella no, para que no se pueda reutilizar', async () => {
  const first = await quote();
  const second = await quote();
  assert.notEqual(first.quoteToken, second.quoteToken, 'el token lleva caducidad propia');
});

test('un cambio real de precio en el sistema de stock cambia la huella', async () => {
  const before = await quote();
  // El precio se cambia en el sistema privado, que es la fuente de verdad.
  stockDb.prepare('UPDATE product_variants SET sale_price = 900, updated_at = ? WHERE id = ?')
    .run(new Date().toISOString(), variantId);
  const after = await quote();
  assert.equal(after.totalCents, 90000, 'la tienda toma el precio nuevo');
  assert.notEqual(after.quoteHash, before.quoteHash, 'una variación de precio debe detectarse: el cliente tiene que revisarla');

  // Y al volver al precio anterior, la huella vuelve a coincidir.
  stockDb.prepare('UPDATE product_variants SET sale_price = 750, updated_at = ? WHERE id = ?')
    .run(new Date().toISOString(), variantId);
  const restored = await quote();
  assert.equal(restored.quoteHash, before.quoteHash, 'sin cambios la huella es la misma');
});

test('un pedido se crea sin necesidad de aceptar cambios de precio', async () => {
  const current = await quote();
  const response = await agent.post('/api/checkout/orders').set('X-CSRF-Token', csrf).set('Idempotency-Key', 'quote-hash-purchase-1').send({
    firstName: 'Iván', lastName: 'Prueba', documentNumber: '31.222.333', email: 'ivan@example.com', phone: '3512222222',
    fulfillmentMethod: 'PICKUP', paymentMethod: 'bank_transfer', quoteToken: current.quoteToken
    // Sin acceptPriceChanges: el flujo normal de un cliente que no cambió nada.
  });
  assert.equal(response.status, 201, `el cliente debe poder comprar sin marcar la casilla: ${JSON.stringify(response.body)}`);
  assert.equal(response.body.data.order.stockStatus, 'RESERVED');
});
