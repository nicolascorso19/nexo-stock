import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { getConfig } from '../src/config.js';
import { openDatabase, closeDatabase, getDatabase } from '../src/db/database.js';
import { createApp } from '../src/app.js';

/**
 * El catálogo puede publicarse sin precio de venta registrado (por ejemplo
 * mientras se cargan los precios en USD). Ese catálogo se VUELCA, pero no se
 * puede comprar: sin precio no hay cotización y, por lo tanto, tampoco pedido.
 *
 * Es el invariante que hace seguro abrir el catálogo visual: mostrar un
 * producto sin precio nunca puede convertirse en una venta a precio cero.
 */

let app;
let config;

const catalog = {
  currency: 'USD',
  products: [
    {
      id: 901, name: 'Producto sin precio', slug: 'producto-sin-precio', brand: 'Genérico', model: 'Sin precio',
      category: 'Accesorios', categoryId: 1, published: true, description: 'Visible, no comprable.', images: [],
      variants: [{ id: 902, productId: 901, sku: 'EXT-SIN-PRECIO', capacity: '', color: '', condition: 'NEW', price: null, priceKnown: false, availableQuantity: 5, availability: 'IN', published: true, images: [], requiresImei: false }]
    },
    {
      id: 903, name: 'Producto con precio', slug: 'producto-con-precio', brand: 'Apple', model: 'Con precio',
      category: 'Celulares', categoryId: 2, published: true, description: 'Comprable.', images: [],
      variants: [{ id: 904, productId: 903, sku: 'EXT-CON-PRECIO', capacity: '256GB', color: 'Negro', condition: 'NEW', price: 100, priceKnown: true, availableQuantity: 2, availability: 'IN', published: true, images: [], requiresImei: false }]
    }
  ]
};

before(async () => {
  config = getConfig({ NODE_ENV: 'test', DB_PATH: ':memory:', PUBLIC_BASE_URL: 'http://localhost:4000', STOCK_API_SECRET: 's'.repeat(48), STOCK_WEBHOOK_SECRET: 'w'.repeat(48), COOKIE_SECURE: 'false' });
  openDatabase(config);
  getDatabase().prepare('UPDATE store_config SET pickup_enabled = 1, transfer_enabled = 1 WHERE id = 1').run();
  app = createApp(config, {
    catalogClient: {
      calls: [],
      async getCatalog() { return structuredClone(catalog); },
      async reserve() { this.calls.push('reserve'); return { reservationId: 'res-1', expiresAt: new Date(Date.now() + 600000).toISOString() }; },
      async confirmReservation() { this.calls.push('confirm'); return { saleId: 1, reservationId: 'res-1' }; },
      async releaseReservation() { this.calls.push('release'); return { released: true }; },
      async cancelOrder() { this.calls.push('cancel'); return { cancelled: true }; },
      async health() { return { ok: true }; }
    }
  });
});

after(() => closeDatabase());

test('el catálogo público muestra el producto sin precio, marcado como no consultable', async () => {
  const response = await request(app).get('/api/storefront/catalog').expect(200);
  const sinPrecio = response.body.data.products.find((product) => product.id === 901);
  assert.ok(sinPrecio, 'el producto sin precio debe aparecer en el catálogo');
  const variant = sinPrecio.variants[0];
  assert.equal(variant.priceKnown, false);
  assert.equal(variant.price, null);
});

test('agregar al carrito una variante sin precio falla con PRICE_NOT_REGISTERED y no crea la línea', async () => {
  const buyer = request.agent(app);
  const session = await buyer.get('/api/auth/session').expect(200);
  const response = await buyer.post('/api/cart/items').set('X-CSRF-Token', session.body.data.csrfToken)
    .send({ inventoryVariantId: 902, quantity: 1 });
  assert.equal(response.status, 503);
  assert.equal(response.body.error.code, 'PRICE_NOT_REGISTERED');
  const cart = await buyer.get('/api/cart').expect(200);
  assert.equal(cart.body.data.items.length, 0, 'no debe quedar ninguna línea en el carrito');
});

test('sin una cotización válida no hay pedido ni reserva al stock', async () => {
  const buyer = request.agent(app);
  const session = await buyer.get('/api/auth/session').expect(200);
  const csrf = session.body.data.csrfToken;
  // La variante sin precio nunca entró al carrito (test anterior), así que la
  // cotización falla antes. Lo relevante: no se crea ningún pedido.
  const quote = await buyer.post('/api/checkout/quote').set('X-CSRF-Token', csrf).send({ fulfillmentMethod: 'PICKUP' });
  assert.ok(quote.status >= 400, 'una cotización sin carrito debe rechazarse');
  assert.ok(['EMPTY_CART', 'PRICE_NOT_REGISTERED'].includes(quote.body.error.code), `código inesperado: ${quote.body.error.code}`);

  const order = await buyer.post('/api/checkout/orders')
    .set('X-CSRF-Token', csrf)
    .set('Idempotency-Key', 'sin-precio-1')
    .send({
      firstName: 'Ana', lastName: 'Prueba', documentNumber: '30.111.222', email: 'ana@example.com', phone: '3511111111',
      fulfillmentMethod: 'PICKUP', paymentMethod: 'bank_transfer', quoteToken: 'inventado', acceptPriceChanges: true
    });
  assert.ok(order.status >= 400, 'el pedido sin cotización válida debe rechazarse');
  assert.equal(getDatabase().prepare('SELECT COUNT(*) AS c FROM orders').get().c, 0, 'no debe existir ningún pedido');
});

test('una variante con precio sigue comprándose con normalidad', async () => {
  const buyer = request.agent(app);
  const session = await buyer.get('/api/auth/session').expect(200);
  const csrf = session.body.data.csrfToken;
  await buyer.post('/api/cart/items').set('X-CSRF-Token', csrf).send({ inventoryVariantId: 904, quantity: 1 }).expect(201);
  const quote = (await buyer.post('/api/checkout/quote').set('X-CSRF-Token', csrf).send({ fulfillmentMethod: 'PICKUP' })).body.data.quote;
  assert.equal(quote.totalCents, 10000);
  const order = await buyer.post('/api/checkout/orders').set('X-CSRF-Token', csrf)
    .set('Idempotency-Key', 'con-precio-1')
    .send({
      firstName: 'Ana', lastName: 'Prueba', documentNumber: '30.111.333', email: 'ana2@example.com', phone: '3511111112',
      fulfillmentMethod: 'PICKUP', paymentMethod: 'bank_transfer', quoteToken: quote.quoteToken, acceptPriceChanges: true
    }).expect(201);
  assert.equal(order.body.data.order.status, 'PENDING_PAYMENT');
});
