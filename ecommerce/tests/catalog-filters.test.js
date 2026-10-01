import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { getConfig } from '../src/config.js';
import { openDatabase, closeDatabase, getDatabase } from '../src/db/database.js';
import { createApp } from '../src/app.js';

/**
 * Filtros, orden y paginación del catálogo público. Todos son filtros que la
 * interfaz ya enviaba; el servidor los tenía que aplicar de verdad.
 */

let app;
let agent;
let config;

const product = (id, name, extra = {}, variants = []) => ({
  id, name, slug: `p-${id}`, brand: 'Apple', model: extra.model || 'iPhone 15', category: extra.category || 'iPhone',
  categoryId: 1, published: true, description: '', images: [], publishedAt: extra.publishedAt || null,
  ...extra,
  variants
});

const variant = (id, productId, price, extra = {}) => ({
  id, productId, sku: `SKU-${id}`, capacity: extra.capacity || '256GB', color: extra.color || 'Negro',
  condition: extra.condition || 'NEW', price, availableQuantity: extra.stock ?? 5, availability: extra.availability || 'IN',
  published: true, images: [], requiresImei: false, previousPrice: extra.previousPrice ?? null
});

before(() => {
  config = getConfig({ NODE_ENV: 'test', DB_PATH: ':memory:', PUBLIC_BASE_URL: 'http://localhost:4000', STOCK_API_SECRET: 's'.repeat(48), STOCK_WEBHOOK_SECRET: 'w'.repeat(48), COOKIE_SECURE: 'false' });
  openDatabase(config);
  const catalog = {
    currency: 'USD',
    products: [
      product(1, 'iPhone Barato', { publishedAt: '2026-01-01T00:00:00.000Z' }, [variant(11, 1, 100)]),
      product(2, 'iPhone Caro', { publishedAt: '2026-06-01T00:00:00.000Z', model: 'iPhone 15 Pro Max' }, [variant(21, 2, 900, { previousPrice: 1200, capacity: '512GB', color: 'Azul profundo' })]),
      product(3, 'iPhone Usado', { condition: 'USED', category: 'Usados' }, [variant(31, 3, 300, { condition: 'USED', availability: 'OUT', stock: 0 })])
    ]
  };
  app = createApp(config, { catalogClient: { async getCatalog() { return structuredClone(catalog); } } });
  agent = request.agent(app);
});

after(() => closeDatabase());

const names = (body) => body.data.products.map((item) => item.name);

/** GET del catálogo comprobando el 200 y devolviendo el body. */
async function catalog(query) {
  const response = await agent.get(`/api/storefront/catalog${query}`).expect(200);
  return response.body;
}

test('maxPrice and minPrice filter by variant price', async () => {
  assert.deepEqual(names(await catalog('?maxPrice=500')), ['iPhone Barato', 'iPhone Usado']);
  assert.deepEqual(names(await catalog('?minPrice=500')), ['iPhone Caro']);
  const single = await catalog('?maxPrice=500');
  // Al filtrar por precio, el producto sólo conserva la variante que entra.
  assert.deepEqual(single.data.products[0].variants.map((item) => item.price), [100]);
});

test('discount, condition and model filters are applied server-side', async () => {
  assert.deepEqual(names(await catalog('?discount=true')), ['iPhone Caro']);
  assert.deepEqual(names(await catalog('?condition=usado')), ['iPhone Usado']);
  assert.deepEqual(names(await catalog('?model=iPhone 15 Pro Max')), ['iPhone Caro']);
});

test('the condition filter works in Spanish and English, in API and in server HTML', async () => {
  const mixed = {
    currency: 'USD',
    products: [{
      id: 9, name: 'iPhone 15', slug: 'iphone-15', brand: 'Apple', model: 'iPhone 15', category: 'iPhone',
      categoryId: 1, published: true, description: '', images: [], publishedAt: '2026-08-01T00:00:00.000Z',
      variants: [
        { ...variant(91, 9, 100), condition: 'Nuevo' },
        { ...variant(92, 9, 80), condition: 'Usado' }
      ]
    }]
  };
  const scoped = createApp(config, { catalogClient: { async getCatalog() { return structuredClone(mixed); } } });
  const api = request.agent(scoped);
  // El stock etiqueta en español. Un enlace guardado con "USED" tiene que
  // encontrar lo mismo que "usado", y el HTML de servidor también.
  for (const [written, expected] of [['usado', 'Usado'], ['Usado', 'Usado'], ['USED', 'Usado'], ['nuevo', 'Nuevo'], ['NEW', 'Nuevo']]) {
    const body = await (await api.get(`/api/storefront/catalog?condition=${written}`).expect(200)).body;
    assert.deepEqual(body.data.products.map((item) => item.id), [9], `condition=${written} debe encontrar el producto`);
    assert.deepEqual(body.data.products[0].variants.map((item) => item.condition), [expected], `condition=${written}`);
    const page = await request(scoped).get(`/catalogo?condition=${written}`).expect(200);
    assert.match(page.text, /iPhone 15/, `el HTML de servidor debe coincidir con condition=${written}`);
  }
});

test('condition resolves per variant, so a mixed product stays reachable', async () => {
  const mixed = {
    currency: 'USD',
    products: [{
      id: 9, name: 'iPhone 15', slug: 'iphone-15', brand: 'Apple', model: 'iPhone 15', category: 'iPhone',
      categoryId: 1, published: true, description: '', images: [], publishedAt: '2026-08-01T00:00:00.000Z',
      variants: [
        variant(91, 9, 100, { condition: 'NEW' }),
        variant(92, 9, 80, { condition: 'USED' })
      ]
    }]
  };
  const scoped = createApp(config, { catalogClient: { async getCatalog() { return structuredClone(mixed); } } });
  const api = request.agent(scoped);
  // El producto no declara condición: el filtro tiene que resolverse por variante,
  // si no un equipo con variantes nuevas y usadas desaparece al filtrar.
  for (const condition of ['NEW', 'USED']) {
    const body = await (await api.get(`/api/storefront/catalog?condition=${condition}`).expect(200)).body;
    assert.deepEqual(body.data.products.map((item) => item.id), [9], `condition=${condition} debe encontrar el producto`);
    assert.deepEqual(body.data.products[0].variants.map((item) => item.condition), [condition]);
  }
  // Y el HTML de servidor tiene que coincidir con la API.
  const page = await request(scoped).get('/catalogo?condition=USED').expect(200);
  assert.match(page.text, /iPhone 15/);
  const none = await request(scoped).get('/catalogo?condition=NEW&capacity=512GB').expect(200);
  assert.doesNotMatch(none.text, /iPhone 15/);
});

test('newest sorts by the real publication date', async () => {
  const body = await catalog('?sort=newest');
  assert.equal(body.data.products[0].publishedAt, '2026-06-01T00:00:00.000Z');
  assert.deepEqual(names(body).slice(0, 2), ['iPhone Caro', 'iPhone Barato']);
});

test('price sorts order by the lowest known variant price', async () => {
  assert.deepEqual(names(await catalog('?sort=price-asc')), ['iPhone Barato', 'iPhone Usado', 'iPhone Caro']);
  assert.deepEqual(names(await catalog('?sort=price-desc')), ['iPhone Caro', 'iPhone Usado', 'iPhone Barato']);
});

test('an explicit sort is not overridden by merchandising order', async () => {
  getDatabase().prepare('INSERT INTO merchandising_products (inventory_product_id, featured, trending, sort_order, updated_at) VALUES (?, 0, 0, 100, ?)').run('1', new Date().toISOString());
  // El panel prioriza el producto 1, pero el visitante pidió precio descendente.
  assert.deepEqual(names(await catalog('?sort=price-desc')), ['iPhone Caro', 'iPhone Usado', 'iPhone Barato']);
  // Sin orden explícito manda la prioridad del panel y después el alfabético.
  assert.deepEqual(names(await catalog('')), ['iPhone Barato', 'iPhone Caro', 'iPhone Usado']);
  getDatabase().prepare('DELETE FROM merchandising_products').run();
});

test('pagination reports totals and never hides products behind a 24 cap', async () => {
  getDatabase().prepare('INSERT INTO merchandising_products (inventory_product_id, featured, trending, sort_order, updated_at) VALUES (?, 0, 0, 0, ?)').run('1', new Date().toISOString());
  const first = await catalog('?pageSize=1&page=1');
  const second = await catalog('?pageSize=1&page=2');
  const third = await catalog('?pageSize=1&page=3');
  assert.equal(first.data.total, 3);
  assert.equal(first.data.totalPages, 3);
  assert.equal(third.data.products.length, 1);
  const seen = new Set([...first.data.products, ...second.data.products, ...third.data.products].map((item) => item.id));
  assert.equal(seen.size, 3);
  getDatabase().prepare('DELETE FROM merchandising_products').run();
});

test('the catalog never exposes private stock fields through any filter', async () => {
  const body = await catalog('?discount=true&sort=offers&pageSize=48');
  for (const item of body.data.products) {
    assert.equal(item.cost, undefined);
    assert.equal(item.imei, undefined);
    for (const itemVariant of item.variants) {
      assert.equal(itemVariant.cost, undefined);
      assert.equal(itemVariant.imei, undefined);
    }
  }
});
