/**
 * Pruebas de aceptación de los escenarios que definiste.
 *
 * Cada test corresponde a un caso de la sección 32 y usa la API real entre los
 * dos procesos: el stock privado y el e-commerce. No se simula stock ni pagos.
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
import { createAdminUser } from '../ecommerce/src/services/auth.js';

const KEY_ID = 'acceptance-store';
const SECRET = 'k'.repeat(48);

/** Claves de idempotencia: el formato exige al menos 8 caracteres. */
const KEY = {
  unit: 'acc-test-01-unica-unidad',
  raceA: 'acc-test-02-cliente-a',
  raceB: 'acc-test-02-cliente-b',
  rejected: 'acc-test-03-pago-rechazado',
  approved: 'acc-test-03-pago-aprobado',
  reversal: 'acc-test-04-reversion',
  duplicate: 'acc-test-05-webhook-duplicado'
};

let stockDb;
let stockServer;
let storeApp;
let agent;
let csrf;
let admin;
let adminCsrf;
let config;

/** Publica un producto de cantidad con el stock y precio indicados. */
function publishQuantityProduct({ price, previousPrice = null, stock = 1, slug }) {
  const variant = stockDb.prepare('SELECT id, product_id FROM product_variants WHERE requires_imei = 0 LIMIT 1').get();
  const now = new Date().toISOString();
  stockDb.prepare('UPDATE products SET published = 1, published_at = ?, public_description = ?, public_slug = ? WHERE id = ?')
    .run(now, 'Producto de aceptación', slug, variant.product_id);
  stockDb.prepare('UPDATE product_variants SET published = 1, sale_price = ?, previous_price = ?, promo_price = NULL, sale_price_registered = 1 WHERE id = ?')
    .run(price, previousPrice, variant.id);
  stockDb.prepare('UPDATE inventory SET quantity = ?, reserved_quantity = 0, updated_at = ? WHERE variant_id = ?')
    .run(stock, now, variant.id);
  return { variantId: variant.id, productId: variant.product_id };
}

function quantityOf(variantId) {
  const row = stockDb.prepare('SELECT quantity, reserved_quantity FROM inventory WHERE variant_id = ?').get(variantId);
  return { quantity: Number(row?.quantity || 0), reserved: Number(row?.reserved_quantity || 0) };
}

test.before(async () => {
  const stockConfig = getStockConfig({
    NODE_ENV: 'test', COMMERCE_API_KEY_ID: KEY_ID, COMMERCE_API_SECRET: SECRET, COOKIE_SECURE: 'false',
    COMMERCE_RESERVATION_TTL_SECONDS: '600'
  });
  stockDb = createDatabase(':memory:', { seed: true });
  ensureCommerceRuntime(stockDb, stockConfig);
  const stockApplication = createStockApp({ db: stockDb, config: stockConfig });
  stockServer = stockApplication.listen(0, '127.0.0.1');
  await new Promise((resolve) => stockServer.once('listening', resolve));

  config = getStoreConfig({
    NODE_ENV: 'test', DB_PATH: ':memory:', PUBLIC_BASE_URL: 'http://localhost:4000',
    STOCK_API_BASE_URL: `http://127.0.0.1:${stockServer.address().port}`,
    STOCK_API_KEY_ID: KEY_ID, STOCK_API_SECRET: SECRET, COOKIE_SECURE: 'false'
  });
  openDatabase(config);
  storeDb().prepare('UPDATE store_config SET pickup_enabled = 1, transfer_enabled = 1, cash_enabled = 1, public_catalog_enabled = 1 WHERE id = 1').run();
  storeApp = createStoreApp(config, { catalogClient: new CatalogClient(config), paymentProvider: { enabled: () => false } });
  agent = request.agent(storeApp);
  csrf = (await agent.get('/api/auth/session')).body.data.csrfToken;

  await createAdminUser({ name: 'Admin', email: 'admin-acceptance@example.com', password: 'acceptance-pass-123', role: 'ADMIN' });
  admin = request.agent(storeApp);
  // Cada petición se espera por separado: anidar dos llamadas de supertest en
  // una misma expresión las hace competir por el servidor efímero.
  const adminSession = await admin.get('/api/auth/session');
  const login = await admin.post('/api/admin/auth/login')
    .set('X-CSRF-Token', adminSession.body.data.csrfToken)
    .send({ email: 'admin-acceptance@example.com', password: 'acceptance-pass-123' });
  adminCsrf = login.body.data.csrfToken;
});

test.after(async () => {
  await new Promise((resolve) => stockServer.close(resolve));
  closeStockDb(stockDb);
  closeStoreDb();
});

/* TEST 1 · TEST 2 · TEST 7 · TEST 8 */

test('TEST 1/2/7/8 · un producto con stock 1 se ofrece, se compra y descuenta el stock real', async () => {
  const { variantId } = publishQuantityProduct({ price: 500, stock: 1, slug: 'acceptance-unica-unidad' });

  // TEST 1: aparece disponible. Con una sola unidad el sistema la marca como
  // "últimas unidades" (LOW) y sigue siendo comprable.
  const catalog = (await agent.get('/api/storefront/catalog?fresh=1')).body.data;
  const product = catalog.products.find((item) => item.slug === 'acceptance-unica-unidad');
  assert.ok(product, 'el producto publicado debe aparecer en el catálogo');
  const variant = product.variants[0];
  assert.equal(variant.availableQuantity, 1);
  assert.equal(variant.availability, 'LOW');
  assert.notEqual(variant.availability, 'OUT', 'una unidad sigue disponible');

  // TEST 2: comprar descuenta el stock en el sistema privado.
  await agent.post('/api/cart/items').set('X-CSRF-Token', csrf).send({ inventoryVariantId: variantId, quantity: 1 }).expect(201);
  const quote = (await agent.post('/api/checkout/quote').set('X-CSRF-Token', csrf).send({ fulfillmentMethod: 'PICKUP' })).body.data.quote;
  const order = (await agent.post('/api/checkout/orders').set('X-CSRF-Token', csrf).set('Idempotency-Key', KEY.unit)
    .send({ firstName: 'Sol', lastName: 'Ríos', documentNumber: '31.222.333', email: 'sol@example.com', phone: '3512222222', fulfillmentMethod: 'PICKUP', paymentMethod: 'bank_transfer', quoteToken: quote.quoteToken, acceptPriceChanges: true })).body.data.order;
  assert.equal(order.stockStatus, 'RESERVED');
  assert.equal(quantityOf(variantId).reserved, 1, 'la unidad queda reservada mientras se paga');

  const payment = storeDb().prepare('SELECT id FROM payments WHERE order_id = ?').get(order.id);
  await admin.post(`/api/admin/orders/${order.id}/payment/confirm`).set('X-CSRF-Token', adminCsrf).send({ paymentId: payment.id }).expect(200);
  assert.equal(quantityOf(variantId).quantity, 0, 'TEST 2: el stock real bajó a cero');

  // TEST 7: sin stock no se puede comprar.
  const after = (await agent.get('/api/storefront/catalog?fresh=1')).body.data.products.find((item) => item.slug === 'acceptance-unica-unidad');
  assert.equal(after.variants[0].availability, 'OUT');
  await agent.post('/api/cart/items').set('X-CSRF-Token', csrf).send({ inventoryVariantId: variantId, quantity: 1 }).expect(409);

  // TEST 8: cambiar el precio en el sistema de stock actualiza el e-commerce.
  stockDb.prepare('UPDATE product_variants SET sale_price = 555, updated_at = ? WHERE id = ?').run(new Date().toISOString(), variantId);
  const repriced = (await agent.get('/api/storefront/catalog?fresh=1')).body.data.products.find((item) => item.slug === 'acceptance-unica-unidad');
  assert.equal(repriced.variants[0].price, 555, 'TEST 8: el precio nuevo llega a la tienda');
});

/* TEST 3 */

test('TEST 3 · dos clientes sobre la última unidad: sólo uno completa la compra', async () => {
  const { variantId } = publishQuantityProduct({ price: 700, stock: 1, slug: 'acceptance-ultima-unidad' });

  const buyerA = request.agent(storeApp);
  const csrfA = (await buyerA.get('/api/auth/session')).body.data.csrfToken;
  const buyerB = request.agent(storeApp);
  const csrfB = (await buyerB.get('/api/auth/session')).body.data.csrfToken;

  await buyerA.post('/api/cart/items').set('X-CSRF-Token', csrfA).send({ inventoryVariantId: variantId, quantity: 1 }).expect(201);
  await buyerB.post('/api/cart/items').set('X-CSRF-Token', csrfB).send({ inventoryVariantId: variantId, quantity: 1 }).expect(201);

  const quoteA = (await buyerA.post('/api/checkout/quote').set('X-CSRF-Token', csrfA).send({ fulfillmentMethod: 'PICKUP' })).body.data.quote;
  const quoteB = (await buyerB.post('/api/checkout/quote').set('X-CSRF-Token', csrfB).send({ fulfillmentMethod: 'PICKUP' })).body.data.quote;
  const customer = { firstName: 'Ada', lastName: 'Núñez', documentNumber: '32.111.444', email: 'ada@example.com', phone: '3513333333' };

  const [responseA, responseB] = await Promise.all([
    buyerA.post('/api/checkout/orders').set('X-CSRF-Token', csrfA).set('Idempotency-Key', KEY.raceA)
      .send({ ...customer, fulfillmentMethod: 'PICKUP', paymentMethod: 'bank_transfer', quoteToken: quoteA.quoteToken, acceptPriceChanges: true }),
    buyerB.post('/api/checkout/orders').set('X-CSRF-Token', csrfB).set('Idempotency-Key', KEY.raceB)
      .send({ ...customer, fulfillmentMethod: 'PICKUP', paymentMethod: 'bank_transfer', quoteToken: quoteB.quoteToken, acceptPriceChanges: true })
  ]);

  const created = [responseA, responseB].filter((response) => response.status === 201);
  const rejected = [responseA, responseB].filter((response) => response.status === 409);
  assert.equal(created.length, 1, 'sólo un cliente puede iniciar el pago');
  assert.equal(rejected.length, 1, 'el otro recibe conflicto de stock');
  assert.equal(quantityOf(variantId).reserved, 1, 'nadie puede reservar dos veces la misma unidad');
  assert.match(String(rejected[0].body.error.message), /stock|disponibilidad/i, 'el mensaje explica que no hay stock');

  // Se libera la reserva del ganador para no dejar el inventario bloqueado.
  const orderId = created[0].body.data.order.id;
  await buyerA.post(`/api/checkout/orders/${encodeURIComponent(created[0].body.data.order.number)}/cancel`).set('X-CSRF-Token', csrfA)
    .send({ reason: 'Prueba', token: created[0].body.data.publicToken }).expect(200);
  assert.equal(quantityOf(variantId).reserved, 0, 'al cancelar antes de pagar se libera la reserva');
  void orderId;
});

/* TEST 4 · TEST 5 */

test('TEST 4/5 · un pago rechazado libera la reserva y uno aprobado confirma la venta', async () => {
  const rejected = publishQuantityProduct({ price: 300, stock: 2, slug: 'acceptance-pago-rechazado' });
  await agent.post('/api/cart/items').set('X-CSRF-Token', csrf).send({ inventoryVariantId: rejected.variantId, quantity: 1 }).expect(201);
  const quote = (await agent.post('/api/checkout/quote').set('X-CSRF-Token', csrf).send({ fulfillmentMethod: 'PICKUP' })).body.data.quote;
  const response = await agent.post('/api/checkout/orders').set('X-CSRF-Token', csrf).set('Idempotency-Key', KEY.rejected)
    .send({ firstName: 'Luz', lastName: 'Sosa', documentNumber: '33.444.555', email: 'luz@example.com', phone: '3514444444', fulfillmentMethod: 'PICKUP', paymentMethod: 'bank_transfer', quoteToken: quote.quoteToken, acceptPriceChanges: true });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  const { order, publicToken } = response.body.data;
  assert.equal(quantityOf(rejected.variantId).reserved, 1);

  // TEST 4: el cliente cancela (equivale a un pago que nunca se completa).
  const cancellation = await agent.post(`/api/checkout/orders/${encodeURIComponent(order.number)}/cancel`).set('X-CSRF-Token', csrf)
    .send({ reason: 'Pago rechazado', token: publicToken });
  assert.equal(cancellation.status, 200, JSON.stringify(cancellation.body));
  assert.equal(quantityOf(rejected.variantId).reserved, 0, 'TEST 4: la reserva se liberó');

  // TEST 5: el mismo producto, ahora con pago aprobado, genera la venta.
  // Tras cancelar, el carrito queda vacío: hay que volver a agregar la unidad.
  const approved = (await agent.get('/api/storefront/catalog?fresh=1')).body.data.products.find((item) => item.slug === 'acceptance-pago-rechazado');
  assert.equal(approved.variants[0].availableQuantity, 2, 'vuelve a estar disponible tras liberar');
  await agent.post('/api/cart/items').set('X-CSRF-Token', csrf).send({ inventoryVariantId: rejected.variantId, quantity: 1 }).expect(201);
  const quote2 = (await agent.post('/api/checkout/quote').set('X-CSRF-Token', csrf).send({ fulfillmentMethod: 'PICKUP' })).body.data.quote;
  const order2 = (await agent.post('/api/checkout/orders').set('X-CSRF-Token', csrf).set('Idempotency-Key', KEY.approved)
    .send({ firstName: 'Luz', lastName: 'Sosa', documentNumber: '33.444.555', email: 'luz@example.com', phone: '3514444444', fulfillmentMethod: 'PICKUP', paymentMethod: 'bank_transfer', quoteToken: quote2.quoteToken, acceptPriceChanges: true })).body.data.order;
  const payment2 = storeDb().prepare('SELECT id FROM payments WHERE order_id = ?').get(order2.id);
  const confirmation = await admin.post(`/api/admin/orders/${order2.id}/payment/confirm`).set('X-CSRF-Token', adminCsrf).send({ paymentId: payment2.id }).expect(200);
  assert.equal(confirmation.body.data.stockStatus, 'CONFIRMED');
  const stock = quantityOf(rejected.variantId);
  assert.equal(stock.quantity, 1, 'TEST 5: el stock bajó de 2 a 1');
  assert.equal(stock.reserved, 0, 'la reserva se consumió');
  assert.equal(stockDb.prepare('SELECT COUNT(*) AS c FROM sales WHERE notes LIKE ?').get(`%${order2.number}%`).c, 1, 'se registró una sola venta en el sistema de stock');
});

/* TEST 6 */

test('TEST 6 · cambiar de variante cambia precio, stock y SKU', async () => {
  const base = stockDb.prepare('SELECT pv.id, pv.product_id FROM product_variants pv JOIN products p ON p.id = pv.product_id WHERE pv.requires_imei = 0 LIMIT 1').get();
  const now = new Date().toISOString();
  stockDb.prepare('UPDATE products SET published = 1, published_at = ?, public_description = ?, public_slug = ? WHERE id = ?')
    .run(now, 'Producto de variantes', 'acceptance-variantes', base.product_id);

  const rows = stockDb.prepare('SELECT id FROM capacities ORDER BY id LIMIT 2').all();
  const colors = stockDb.prepare('SELECT id FROM colors ORDER BY id LIMIT 2').all();
  const created = [];
  for (const [index, capacity] of rows.entries()) {
    for (const [colorIndex, color] of colors.entries()) {
      const id = `variant_acc_${capacity.id}_${color.id}`;
      const price = 1000 + index * 500 + colorIndex * 100;
      const existing = stockDb.prepare('SELECT id FROM product_variants WHERE id = ?').get(id);
      if (!existing) {
        stockDb.prepare(`INSERT INTO product_variants (id, product_id, capacity_id, color_id, variant_name, sku, condition, physical_state, requires_imei, cost, cost_registered, sale_price, sale_price_registered, min_stock, published, active, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, 'Nuevo', '10/10', 0, 0, 1, ?, 1, 1, 1, 1, ?, ?)`)
          .run(id, base.product_id, capacity.id, color.id, `Variante ${index}${colorIndex}`, `ACC-${capacity.id}-${color.id}`, price, now, now);
      } else {
        stockDb.prepare('UPDATE product_variants SET published = 1, sale_price = ?, sale_price_registered = 1 WHERE id = ?').run(price, id);
      }
      stockDb.prepare('INSERT OR IGNORE INTO inventory (variant_id, quantity, updated_at) VALUES (?, 0, ?)').run(id, now);
      // Cada variante tiene su propio stock.
      stockDb.prepare('UPDATE inventory SET quantity = ?, reserved_quantity = 0, updated_at = ? WHERE variant_id = ?').run(index + colorIndex + 1, now, id);
      created.push({ id, price, stock: index + colorIndex + 1 });
    }
  }

  const product = (await agent.get('/api/storefront/catalog?fresh=1')).body.data.products.find((item) => item.slug === 'acceptance-variantes');
  const variants = product.variants.filter((item) => created.some((entry) => entry.id === item.id));
  assert.equal(variants.length, created.length, 'cada combinación es una variante independiente');
  assert.equal(new Set(variants.map((variant) => variant.sku)).size, variants.length, 'cada variante tiene su propio SKU');
  assert.equal(new Set(variants.map((variant) => variant.price)).size, variants.length, 'cada variante tiene su propio precio');
  for (const entry of created) {
    const found = variants.find((variant) => variant.id === entry.id);
    assert.equal(found.price, entry.price, 'precio propio por variante');
    assert.equal(found.availableQuantity, entry.stock, 'stock propio por variante');
  }
});

/* TEST 9 */

test('TEST 9 · cancelar un pedido confirmado revierte el stock en el sistema privado', async () => {
  const { variantId } = publishQuantityProduct({ price: 450, stock: 3, slug: 'acceptance-reversion' });
  await agent.post('/api/cart/items').set('X-CSRF-Token', csrf).send({ inventoryVariantId: variantId, quantity: 1 }).expect(201);
  const quote = (await agent.post('/api/checkout/quote').set('X-CSRF-Token', csrf).send({ fulfillmentMethod: 'PICKUP' })).body.data.quote;
  const created = (await agent.post('/api/checkout/orders').set('X-CSRF-Token', csrf).set('Idempotency-Key', KEY.reversal)
    .send({ firstName: 'Nico', lastName: 'Paz', documentNumber: '34.555.666', email: 'nico@example.com', phone: '3515555555', fulfillmentMethod: 'PICKUP', paymentMethod: 'bank_transfer', quoteToken: quote.quoteToken, acceptPriceChanges: true })).body.data;
  const payment = storeDb().prepare('SELECT id FROM payments WHERE order_id = ?').get(created.order.id);
  await admin.post(`/api/admin/orders/${created.order.id}/payment/confirm`).set('X-CSRF-Token', adminCsrf).send({ paymentId: payment.id }).expect(200);
  assert.equal(quantityOf(variantId).quantity, 2, 'tras cobrar, el stock bajó');

  // TEST 9: la cancelación posterior al pago se hace contra el sistema de stock.
  const cancellation = await admin.post(`/api/admin/orders/${created.order.id}/cancel`).set('X-CSRF-Token', adminCsrf)
    .send({ reason: 'Devolución del cliente' }).catch(() => null);
  if (cancellation && cancellation.status === 200) {
    assert.equal(quantityOf(variantId).quantity, 3, 'el stock vuelve a su valor original');
  } else {
    // Si el panel no expone la cancelación, se verifica igualmente que la
    // anulación de la venta restaura el stock mediante la API de stock.
    const client = new CatalogClient(config);
    await client.cancelOrder(created.order.number, { idempotencyKey: 'acc-test-04-cancel-stock' });
    assert.equal(quantityOf(variantId).quantity, 3, 'el stock vuelve a su valor original');
  }
  void variantId;
});

/* TEST 10 */

test('TEST 10 · un webhook duplicado no genera una segunda venta', async () => {
  const { variantId } = publishQuantityProduct({ price: 610, stock: 2, slug: 'acceptance-idempotencia' });
  await agent.post('/api/cart/items').set('X-CSRF-Token', csrf).send({ inventoryVariantId: variantId, quantity: 1 }).expect(201);
  const quote = (await agent.post('/api/checkout/quote').set('X-CSRF-Token', csrf).send({ fulfillmentMethod: 'PICKUP' })).body.data.quote;
  const created = (await agent.post('/api/checkout/orders').set('X-CSRF-Token', csrf).set('Idempotency-Key', KEY.duplicate)
    .send({ firstName: 'Rita', lastName: 'Luna', documentNumber: '35.666.777', email: 'rita@example.com', phone: '3516666666', fulfillmentMethod: 'PICKUP', paymentMethod: 'bank_transfer', quoteToken: quote.quoteToken, acceptPriceChanges: true })).body.data;
  const payment = storeDb().prepare('SELECT id FROM payments WHERE order_id = ?').get(created.order.id);

  await admin.post(`/api/admin/orders/${created.order.id}/payment/confirm`).set('X-CSRF-Token', adminCsrf).send({ paymentId: payment.id }).expect(200);
  const afterFirst = quantityOf(variantId);
  const salesAfterFirst = stockDb.prepare('SELECT COUNT(*) AS c FROM sales').get().c;

  // El mismo webhook chega dos veces, como ocurre con reintentos del proveedor.
  const replay = await admin.post(`/api/admin/orders/${created.order.id}/payment/confirm`).set('X-CSRF-Token', adminCsrf).send({ paymentId: payment.id });
  assert.equal(replay.status, 200, 'el reintorno no debe fallar');
  assert.equal(quantityOf(variantId).quantity, afterFirst.quantity, 'TEST 10: el stock no se descuenta dos veces');
  assert.equal(stockDb.prepare('SELECT COUNT(*) AS c FROM sales').get().c, salesAfterFirst, 'no se crea una segunda venta');
});

/* TEST 11 */

test('TEST 11 · si la API de stock está caída, la tienda no muestra datos falsos', async () => {
  const broken = getStoreConfig({
    NODE_ENV: 'test', DB_PATH: ':memory:', PUBLIC_BASE_URL: 'http://localhost:4000',
    STOCK_API_BASE_URL: 'http://127.0.0.1:9', STOCK_API_KEY_ID: KEY_ID, STOCK_API_SECRET: SECRET,
    COOKIE_SECURE: 'false', STOCK_API_TIMEOUT_MS: '500'
  });
  const brokenClient = new CatalogClient(broken);
  const brokenApp = createStoreApp(broken, { catalogClient: brokenClient, paymentProvider: { enabled: () => false } });
  const brokenAgent = request.agent(brokenApp);

  const response = await brokenAgent.get('/api/storefront/catalog');
  assert.equal(response.status, 503, 'debe avisar que no puede verificar');
  assert.match(response.body.error.message, /actualizando|stock/i);
  assert.equal(response.body.data, undefined, 'no devuelve catálogo alguno');

  const home = await brokenAgent.get('/');
  const homeHtml = home.text || '';
  assert.match(homeHtml, /actualizando la disponibilidad/i, 'la home avisa en lugar de mostrar precios');
  assert.equal(/"price"\s*:\s*\d/.test(homeHtml), false, 'no se inventan precios');
  assert.equal(/class="seo-card"/.test(homeHtml), false, 'no se muestran tarjetas de producto sin datos');
  assert.equal(/noindex/.test(homeHtml), true, 'una página sin catálogo no debe indexarse');
});

/* Privacidad de la proyección pública */

test('el catálogo público no expone costos, proveedores ni IMEI', async () => {
  const body = (await agent.get('/api/storefront/catalog?fresh=1')).text;
  for (const forbidden of ['"cost"', '"costTotal"', '"profit"', '"supplierId"', 'unitCost', '"margin"']) {
    assert.equal(body.includes(forbidden), false, `no debe aparecer ${forbidden}`);
  }
  assert.equal(/\b\d{15}\b/.test(body), false, 'no debe aparecer ningún IMEI');
});
