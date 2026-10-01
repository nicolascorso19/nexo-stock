import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { getConfig } from '../src/config.js';
import { openDatabase, closeDatabase, getDatabase } from '../src/db/database.js';
import { createApp } from '../src/app.js';
import { createAdminUser } from '../src/services/auth.js';

/**
 * Guardas de dinero y de estado. Un pedido nunca puede avanzar a un estado de
 * entrega sin pago cobrado y stock confirmado, y un reembolso nunca se completa
 * dejando el inventario descuadrado en silencio.
 */

let app;
let stock;
let config;
let admin;
let adminCsrf;

const catalog = {
  currency: 'USD',
  products: [{
    id: 701, name: 'iPhone de prueba', slug: 'iphone-de-prueba', brand: 'Apple', model: 'iPhone test',
    category: 'iPhone', categoryId: 9, published: true, description: 'Fixture.', images: [],
    variants: [{ id: 801, productId: 701, sku: 'TEST-801', capacity: '256GB', color: 'Negro', condition: 'NEW', price: 50, availableQuantity: 3, availability: 'IN', published: true, images: [], requiresImei: false }]
  }]
};

before(async () => {
  config = getConfig({ NODE_ENV: 'test', DB_PATH: ':memory:', PUBLIC_BASE_URL: 'http://localhost:4000', STOCK_API_SECRET: 's'.repeat(48), STOCK_WEBHOOK_SECRET: 'w'.repeat(48), COOKIE_SECURE: 'false' });
  openDatabase(config);
  getDatabase().prepare('UPDATE store_config SET pickup_enabled = 1, transfer_enabled = 1, cash_enabled = 1 WHERE id = 1').run();
  let reservations = 0;
  stock = {
    calls: [],
    async getCatalog() { return structuredClone(catalog); },
    async reserve() { reservations += 1; this.calls.push('reserve'); return { reservationId: `res-guard-${reservations}`, expiresAt: new Date(Date.now() + 600000).toISOString() }; },
    async confirmReservation(id) { this.calls.push(['confirm', id]); return { saleId: 88, reservationId: id }; },
    async releaseReservation(id) { this.calls.push(['release', id]); return { released: true }; },
    async cancelOrder(id) { this.calls.push(['cancel', id]); return { cancelled: true }; },
    async health() { return { ok: true }; }
  };
  app = createApp(config, { catalogClient: stock });
  await createAdminUser({ name: 'Admin', email: 'guard@store.test', password: 'secure-pass-123', role: 'ADMIN' });
  admin = request.agent(app);
  const pre = await admin.get('/api/auth/session').expect(200);
  const login = await admin.post('/api/admin/auth/login').set('X-CSRF-Token', pre.body.data.csrfToken).send({ email: 'guard@store.test', password: 'secure-pass-123' }).expect(200);
  adminCsrf = login.body.data.csrfToken;
});

after(() => closeDatabase());

/** Recorre el flujo real: carrito → cotización → pedido, y devuelve el pedido. */
async function placeOrder({ method = 'bank_transfer' } = {}) {
  const buyer = request.agent(app);
  const session = await buyer.get('/api/auth/session').expect(200);
  const csrf = session.body.data.csrfToken;
  await buyer.post('/api/cart/items').set('X-CSRF-Token', csrf).send({ inventoryVariantId: 801, quantity: 1 }).expect(201);
  const quote = (await buyer.post('/api/checkout/quote').set('X-CSRF-Token', csrf).send({ fulfillmentMethod: 'PICKUP' })).body.data.quote;
  const unique = Math.random().toString(36).slice(2, 8);
  const response = await buyer.post('/api/checkout/orders').set('X-CSRF-Token', csrf).set('Idempotency-Key', `guard-${unique}`).send({
    firstName: 'Ana', lastName: 'Gómez', documentNumber: `30.${unique}.000`, email: `ana-${unique}@example.com`,
    phone: '3511111111', fulfillmentMethod: 'PICKUP', paymentMethod: method, quoteToken: quote.quoteToken, acceptPriceChanges: true
  }).expect(201);
  return { order: response.body.data.order, paymentId: getDatabase().prepare('SELECT id FROM payments WHERE order_id = ?').get(response.body.data.order.id).id };
}

test('an order cannot reach PAYMENT_APPROVED without an approved payment', async () => {
  const { order } = await placeOrder();
  assert.equal(order.status, 'PENDING_PAYMENT');
  const rejected = await admin.patch(`/api/admin/orders/${order.id}/status`).set('X-CSRF-Token', adminCsrf).send({ status: 'PAYMENT_APPROVED' }).expect(409);
  assert.equal(rejected.body.error.code, 'PAYMENT_NOT_APPROVED');
});

test('an order cannot be prepared or delivered while stock is unconfirmed', async () => {
  const { order } = await placeOrder();
  // Cobro acreditado pero inventario todavía sin confirmar: es exactamente el
  // estado en el que el panel no debe poder pasar a "preparando".
  getDatabase().prepare("UPDATE orders SET status = 'PAYMENT_APPROVED', payment_status = 'APPROVED', stock_status = 'RESERVED' WHERE id = ?").run(order.id);
  const preparing = await admin.patch(`/api/admin/orders/${order.id}/status`).set('X-CSRF-Token', adminCsrf).send({ status: 'PREPARING' }).expect(409);
  assert.equal(preparing.body.error.code, 'STOCK_NOT_CONFIRMED');
  // Con stock confirmado, la misma transición pasa y el pedido recorre el
  // ciclo completo hasta entregado.
  getDatabase().prepare("UPDATE orders SET stock_status = 'CONFIRMED' WHERE id = ?").run(order.id);
  await admin.patch(`/api/admin/orders/${order.id}/status`).set('X-CSRF-Token', adminCsrf).send({ status: 'PREPARING' }).expect(200);
  await admin.patch(`/api/admin/orders/${order.id}/status`).set('X-CSRF-Token', adminCsrf).send({ status: 'READY_FOR_PICKUP' }).expect(200);
  const delivered = await admin.patch(`/api/admin/orders/${order.id}/status`).set('X-CSRF-Token', adminCsrf).send({ status: 'DELIVERED', note: 'prueba' }).expect(200);
  assert.equal(delivered.body.data.status, 'DELIVERED');
});

test('a fulfilled order is not walkable to DELIVERED with payment still pending', async () => {
  const { order } = await placeOrder();
  const rejected = await admin.patch(`/api/admin/orders/${order.id}/status`).set('X-CSRF-Token', adminCsrf).send({ status: 'DELIVERED' }).expect(409);
  assert.equal(rejected.body.error.code, 'INVALID_ORDER_TRANSITION');
});

test('FULFILLMENT_REVIEW is not an absorbing state', async () => {
  const { order } = await placeOrder();
  getDatabase().prepare("UPDATE orders SET status = 'FULFILLMENT_REVIEW', stock_status = 'REVIEW' WHERE id = ?").run(order.id);
  const cancelled = await admin.patch(`/api/admin/orders/${order.id}/status`).set('X-CSRF-Token', adminCsrf).send({ status: 'CANCELLED', note: 'Revisión resuelta' }).expect(200);
  assert.equal(cancelled.body.data.status, 'CANCELLED');
});

test('a refund that cannot restore stock fails closed instead of completing silently', async () => {
  const { order, paymentId } = await placeOrder();
  await admin.post(`/api/admin/orders/${order.id}/payment/confirm`).set('X-CSRF-Token', adminCsrf).send({ paymentId }).expect(200);
  const requested = await admin.post('/api/admin/refunds').set('X-CSRF-Token', adminCsrf).send({ orderId: order.id, amountCents: 5000, reason: 'Devolución del cliente', stockAction: 'RETURN_STOCK' }).expect(201);
  const rejected = await admin.post(`/api/admin/refunds/${requested.body.data.id}/approve`).set('X-CSRF-Token', adminCsrf).expect(409);
  assert.equal(rejected.body.error.code, 'STOCK_RETURN_NOT_SUPPORTED');
  assert.equal(getDatabase().prepare('SELECT status FROM refund_requests WHERE id = ?').get(requested.body.data.id).status, 'REQUESTED');
});

test('a CANCEL_SALE refund reverses the stock in the private inventory system', async () => {
  const { order, paymentId } = await placeOrder();
  await admin.post(`/api/admin/orders/${order.id}/payment/confirm`).set('X-CSRF-Token', adminCsrf).send({ paymentId }).expect(200);
  const before = stock.calls.filter((call) => Array.isArray(call) && call[0] === 'cancel').length;
  const requested = await admin.post('/api/admin/refunds').set('X-CSRF-Token', adminCsrf).send({ orderId: order.id, amountCents: 5000, reason: 'Reembolso con anulación', stockAction: 'CANCEL_SALE' }).expect(201);
  await admin.post(`/api/admin/refunds/${requested.body.data.id}/approve`).set('X-CSRF-Token', adminCsrf).expect(200);
  const after = stock.calls.filter((call) => Array.isArray(call) && call[0] === 'cancel');
  assert.equal(after.length, before + 1);
  assert.equal(after.at(-1)[1], order.number);
  assert.equal(getDatabase().prepare('SELECT status FROM refund_requests WHERE id = ?').get(requested.body.data.id).status, 'COMPLETED');
});
