import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import request from 'supertest';
import { getConfig } from '../src/config.js';
import { openDatabase, closeDatabase, getDatabase } from '../src/db/database.js';
import { createApp } from '../src/app.js';
import { createAdminUser } from '../src/services/auth.js';
import { verifyMercadoPagoWebhook } from '../src/services/payments.js';

let app;
let agent;
let csrf;
let stock;
let config;

const catalog = {
  currency: 'USD',
  products: [{
    id: 501,
    name: 'iPhone de prueba',
    slug: 'iphone-de-prueba',
    brand: 'Apple',
    model: 'iPhone test',
    category: 'iPhone',
    categoryId: 9,
    published: true,
    description: 'Producto de fixture para pruebas.',
    images: [],
    variants: [{ id: 901, productId: 501, sku: 'TEST-901', capacity: '256GB', color: 'Negro', condition: 'NEW', price: 100, availableQuantity: 1, availability: 'LOW', published: true, images: [], requiresImei: false }]
  }]
};

before(async () => {
  config = getConfig({ NODE_ENV: 'test', DB_PATH: ':memory:', PUBLIC_BASE_URL: 'http://localhost:4000', STOCK_API_SECRET: 's'.repeat(48), STOCK_WEBHOOK_SECRET: 'w'.repeat(48), COOKIE_SECURE: 'false' });
  openDatabase(config);
  getDatabase().prepare('UPDATE store_config SET pickup_enabled = 1, transfer_enabled = 1, cash_enabled = 1, shipping_enabled = 0 WHERE id = 1').run();
  stock = {
    calls: [],
    async getCatalog() { return structuredClone(catalog); },
    async reserve(payload) { this.calls.push(['reserve', payload]); return { reservationId: 'res-test-1', expiresAt: new Date(Date.now() + 600000).toISOString() }; },
    async confirmReservation(id, payload) { this.calls.push(['confirm', id, payload]); return { saleId: 77, reservationId: id }; },
    async releaseReservation(id, payload) { this.calls.push(['release', id, payload]); return { released: true }; },
    async cancelOrder(id, payload) { this.calls.push(['cancel', id, payload]); return { cancelled: true }; },
    async health() { return { ok: true }; }
  };
  app = createApp(config, { catalogClient: stock });
  agent = request.agent(app);
  const session = await agent.get('/api/auth/session').expect(200);
  csrf = session.body.data.csrfToken;
});

after(() => closeDatabase());

async function cart() {
  const response = await agent.get('/api/cart').expect(200);
  return response.body.data;
}

test('Mercado Pago webhook signature is verified against the official manifest', () => {
  const secret = 'mp-webhook-secret';
  const rawBody = JSON.stringify({ type: 'payment', data: { id: 'pay-123' } });
  const headers = { 'x-signature': '', 'x-request-id': 'req-123', ts: String(Date.now()) };
  headers['x-signature'] = crypto.createHmac('sha256', secret).update(`id:pay-123;request-id:req-123;ts:${headers.ts};`).digest('hex');
  assert.deepEqual(verifyMercadoPagoWebhook({ headers, rawBody, secret }).data.id, 'pay-123');
  assert.throws(() => verifyMercadoPagoWebhook({ headers: { ...headers, 'x-signature': '0'.repeat(64) }, rawBody, secret }), /inválida/);
});

test('health initializes an empty e-commerce domain', async () => {
  const response = await request(app).get('/api/health').expect(200);
  assert.equal(response.body.data.status, 'ok');
  const variantColumn = getDatabase().prepare('PRAGMA table_info(cart_items)').all().find((column) => column.name === 'inventory_variant_id');
  assert.equal(variantColumn.type, 'TEXT');
  const counts = getDatabase().prepare('SELECT (SELECT COUNT(*) FROM orders) AS orders, (SELECT COUNT(*) FROM customers) AS customers, (SELECT COUNT(*) FROM coupons) AS coupons').get();
  assert.deepEqual(counts, { orders: 0, customers: 0, coupons: 0 });
});

test('public catalog projects the private catalog without private stock fields', async () => {
  const response = await agent.get('/api/storefront/catalog').expect(200);
  assert.equal(response.body.data.products[0].variants[0].sku, 'TEST-901');
  assert.equal(response.body.data.products[0].variants[0].availableQuantity, 1);
  assert.equal(response.body.data.products[0].variants[0].cost, undefined);
  assert.equal(response.body.data.products[0].variants[0].imei, undefined);
});

test('cart revalidates the private price and accepts a live variant', async () => {
  const add = await agent.post('/api/cart/items').set('X-CSRF-Token', csrf).send({ inventoryVariantId: 901, quantity: 1 }).expect(201);
  assert.equal(add.body.data.items.length, 1);
  assert.equal(add.body.data.quote.totalCents, 10000);
  const quoted = await agent.post('/api/checkout/quote').set('X-CSRF-Token', csrf).send({ fulfillmentMethod: 'PICKUP' }).expect(200);
  assert.equal(quoted.body.data.quote.totalCents, 10000);
});

test('checkout creates a pending order and a single private reservation', async () => {
  const quote = (await agent.post('/api/checkout/quote').set('X-CSRF-Token', csrf).send({ fulfillmentMethod: 'PICKUP' })).body.data.quote;
  const payload = { firstName: 'Juan', lastName: 'Pérez', documentNumber: '40.123.456', email: 'juan@example.com', phone: '3510000000', fulfillmentMethod: 'PICKUP', paymentMethod: 'bank_transfer', quoteToken: quote.quoteToken, acceptPriceChanges: true };
  const response = await agent.post('/api/checkout/orders').set('X-CSRF-Token', csrf).set('Idempotency-Key', 'checkout-test-0001').send(payload).expect(201);
  assert.match(response.body.data.order.number, /^ORD-/);
  assert.equal(response.body.data.order.stockStatus, 'RESERVED');
  assert.equal(stock.calls.filter((call) => call[0] === 'reserve').length, 1);
  const replay = await agent.post('/api/checkout/orders').set('X-CSRF-Token', csrf).set('Idempotency-Key', 'checkout-test-0001').send(payload).expect(201);
  assert.equal(replay.body.data.order.id, response.body.data.order.id);
  assert.equal(stock.calls.filter((call) => call[0] === 'reserve').length, 1);
});

test('admin can confirm a pending payment and stock confirmation is delegated', async () => {
  await createAdminUser({ name: 'Admin', email: 'admin@store.test', password: 'secure-pass-123', role: 'ADMIN' });
  const admin = request.agent(app);
  const preLogin = await admin.get('/api/auth/session').expect(200);
  const session = await admin.post('/api/admin/auth/login').set('X-CSRF-Token', preLogin.body.data.csrfToken).send({ email: 'admin@store.test', password: 'secure-pass-123' }).expect(200);
  const adminCsrf = session.body.data.csrfToken;
  // El navegador sólo adjunta X-CSRF-Token en mutaciones (public/js/api.js), así
  // que las lecturas del panel se ejercitan sin cabecera, igual que en producción.
  const orders = await admin.get('/api/admin/orders').expect(200);
  const order = orders.body.data[0];
  const paymentId = getDatabase().prepare('SELECT id FROM payments WHERE order_id = ?').get(order.id).id;
  const confirmed = await admin.post(`/api/admin/orders/${order.id}/payment/confirm`).set('X-CSRF-Token', adminCsrf).send({ paymentId }).expect(200);
  assert.equal(confirmed.body.data.stockStatus, 'CONFIRMED');
  assert.equal(stock.calls.filter((call) => call[0] === 'confirm').length, 1);
});

test('admin panel reads work without a CSRF header and mutations still require it', async () => {
  const admin = request.agent(app);
  const preLogin = await admin.get('/api/auth/session').expect(200);
  await admin.post('/api/admin/auth/login').set('X-CSRF-Token', preLogin.body.data.csrfToken).send({ email: 'admin@store.test', password: 'secure-pass-123' }).expect(200);
  // Lecturas: el navegador nunca manda el token en GET (public/js/api.js:19).
  for (const path of ['/api/admin/dashboard', '/api/admin/orders', '/api/admin/settings', '/api/admin/content', '/api/admin/auth/session']) {
    await admin.get(path).expect(200);
  }
  // Una mutación sin token debe seguir siendo rechazada.
  const rejected = await admin.post('/api/admin/auth/logout').expect(403);
  assert.equal(rejected.body.error.code, 'CSRF_FAILED');
});

test('unavailable inventory is not treated as zero or as permission to buy', async () => {
  const original = stock.getCatalog;
  stock.getCatalog = async () => { throw Object.assign(new Error('No se pudo verificar la disponibilidad del producto. Intentá nuevamente en unos segundos.'), { code: 'STOCK_API_UNAVAILABLE' }); };
  const response = await agent.get('/api/cart').expect(200);
  assert.equal(response.body.data.availability.state, 'UNKNOWN');
  stock.getCatalog = original;
});

test('customer registration persists and exposes the authenticated account', async () => {
  const customerAgent = request.agent(app);
  const session = await customerAgent.get('/api/auth/session').expect(200);
  const response = await customerAgent.post('/api/auth/register').set('X-CSRF-Token', session.body.data.csrfToken).send({ firstName: 'Lucía', lastName: 'Gómez', documentNumber: '32.444.555', email: 'lucia@example.com', phone: '3512222222', password: 'client-pass-123' }).expect(201);
  assert.equal(response.body.data.authenticated, true);
  const profile = await customerAgent.get('/api/account/profile').expect(200);
  assert.equal(profile.body.data.email, 'lucia@example.com');
});
