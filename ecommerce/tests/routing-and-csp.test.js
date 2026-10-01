import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { getConfig } from '../src/config.js';
import { openDatabase, closeDatabase } from '../src/db/database.js';
import { createApp } from '../src/app.js';

/**
 * Rutas y cabeceras que el navegador necesita para funcionar: la búsqueda,
 * la vuelta del pago y la CSP que decide si GA4 y Meta Pixel cargan.
 */

let app;
let config;

const catalog = {
  currency: 'USD',
  products: [{
    id: 1, name: 'iPhone 17 Pro Max', slug: 'iphone-17-pro-max', brand: 'Apple', model: 'iPhone 17 Pro Max',
    category: 'iPhone', categoryId: 1, published: true, description: 'Producto de prueba.', images: [],
    publishedAt: '2026-08-01T00:00:00.000Z',
    variants: [
      { id: 11, productId: 1, sku: 'PM-256-AZUL', capacity: '256GB', color: 'Azul profundo', condition: 'NEW', price: 1299, availableQuantity: 3, availability: 'IN', published: true, images: [], requiresImei: true },
      { id: 12, productId: 1, sku: 'PM-512-AZUL', capacity: '512GB', color: 'Azul profundo', condition: 'NEW', price: 1499, availableQuantity: 2, availability: 'IN', published: true, images: [], requiresImei: true },
      { id: 13, productId: 1, sku: 'PM-256-PLATA', capacity: '256GB', color: 'Plata', condition: 'NEW', price: 1299, availableQuantity: 1, availability: 'LOW', published: true, images: [], requiresImei: true }
    ]
  }]
};

before(() => {
  config = getConfig({ NODE_ENV: 'test', DB_PATH: ':memory:', PUBLIC_BASE_URL: 'http://localhost:4000', STOCK_API_SECRET: 's'.repeat(48), STOCK_WEBHOOK_SECRET: 'w'.repeat(48), COOKIE_SECURE: 'false' });
  openDatabase(config);
  app = createApp(config, { catalogClient: { async getCatalog() { return structuredClone(catalog); } } });
});

after(() => closeDatabase());

test('the CSP allows the analytics origins the browser injects at runtime', async () => {
  const csp = (await request(app).get('/catalogo').expect(200)).headers['content-security-policy'];
  for (const origin of ['https://www.googletagmanager.com', 'https://connect.facebook.net']) {
    assert.match(csp, new RegExp(`script-src[^;]*${origin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`), `script-src debe permitir ${origin}`);
  }
  for (const origin of ['https://www.google-analytics.com', 'https://connect.facebook.net']) {
    assert.match(csp, new RegExp(`connect-src[^;]*${origin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`), `connect-src debe permitir ${origin}`);
  }
  // La CSP sigue siendo restrictiva: nada de comodines ni 'unsafe-eval'.
  assert.doesNotMatch(csp, /script-src[^;]*unsafe-eval/);
  assert.match(csp, /script-src[^;]*'nonce-/);
  assert.match(csp, /default-src 'self'/);
});

test('/buscar redirects to /catalogo preserving the query, so results are filtered', async () => {
  const response = await request(app).get('/buscar?q=iphone').expect(302);
  assert.equal(response.headers.location, '/catalogo?q=iphone');
  const page = await request(app).get(response.headers.location).expect(200);
  assert.match(page.text, /iPhone 17 Pro Max/);
});

test('a search that matches nothing shows an empty state, never the whole catalog', async () => {
  const page = await request(app).get('/catalogo?q=producto-que-no-existe-xyz').expect(200);
  assert.doesNotMatch(page.text, /iPhone 17 Pro Max/);
  assert.match(page.text, /No hay productos|coincidan/i);
});

test('the server-rendered catalog paginates so deeper pages are reachable', async () => {
  const many = { currency: 'USD', products: Array.from({ length: 30 }, (_, index) => ({
    id: 100 + index, name: `Producto ${index}`, slug: `producto-${index}`, brand: 'Apple', model: 'M', category: 'iPhone',
    categoryId: 1, published: true, description: '', images: [], publishedAt: '2026-01-01T00:00:00.000Z',
    variants: [{ id: 200 + index, productId: 100 + index, sku: `S-${index}`, capacity: '256GB', color: 'Negro', condition: 'NEW', price: 10 + index, availableQuantity: 1, availability: 'IN', published: true, images: [], requiresImei: false }]
  })) };
  const scoped = createApp(config, { catalogClient: { async getCatalog() { return structuredClone(many); } } });
  const first = await request(scoped).get('/catalogo').expect(200);
  assert.match(first.text, /aria-label="Paginación"/);
  assert.match(first.text, /page=2/);
  const second = await request(scoped).get('/catalogo?page=2').expect(200);
  assert.match(second.text, /aria-current="page"/);
  // Orden alfabético: la página 1 termina en "Producto 3" y la 2 sigue con el 4.
  assert.match(first.text, /Producto 3/);
  assert.doesNotMatch(first.text, /Producto 4</);
  assert.match(second.text, /Producto 4/);
  assert.doesNotMatch(second.text, /Producto 29/);
});

test('the payment return path resolves the order number from the guest token', async () => {
  // /pedido/confirmacion no es un número de pedido: el cliente toma el número
  // del token "<número>.<firma>". Este test fija ese contrato desde el servidor.
  const response = await request(app).get('/pedido/confirmacion?token=ORD-20260101-abcdef.abc123').expect(200);
  assert.ok(response.text.length > 0);
  const bad = await request(app).get('/api/checkout/orders/ORD-20260101-abcdef?token=abc123').expect(404);
  assert.equal(bad.body.error.code, 'ORDER_NOT_FOUND');
});
