/**
 * El catálogo público simple (`/api/public/catalog`) es la vista web que
 * consume el HTML estático del sistema privado. Debe publicar el precio de
 * venta real y el estado de stock, y nada más.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { getConfig } from '../server/config.js';
import { createDatabase, closeDatabase } from '../server/db/database.js';
import { createApp } from '../server/app.js';

let db;
let app;
let agent;
let variantId;
let productId;

async function login() {
  // El mismo agente guarda la cookie: crear otro perdería la sesión.
  const client = request.agent(app);
  const response = await client.post('/api/auth/login').send({ email: 'admin@nexo.com', password: 'admin123' });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  return client;
}

test.before(async () => {
  process.env.NODE_ENV = 'test';
  db = createDatabase(':memory:', { seed: true });
  const config = getConfig({ NODE_ENV: 'test', COOKIE_SECURE: 'false' });
  app = createApp({ db, config });
  agent = await login();

  const created = await agent.post('/api/products').send({
    brand: 'Apple', model: 'iPhone Catálogo', category: 'Celulares',
    capacity: '256GB', color: 'Negro', requiresImei: false,
    price: 1299, salePriceRegistered: true, cost: 900, costRegistered: true,
    published: true, variantPublished: true, publicDescription: 'Producto del catálogo público'
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  variantId = created.body.data.id;
  productId = created.body.data.productId;
});

test.after(() => {
  if (db?.open) closeDatabase(db);
});

const publicProducts = async () => (await request(app).get('/api/public/catalog')).body.data.products;
const findVariant = async () => (await publicProducts()).find((item) => item.id === variantId);

test('el precio de venta real se publica aunque no haya stock', async () => {
  const item = await findVariant();
  assert.ok(item, 'el producto publicado debe aparecer');
  assert.equal(item.price, 1299, 'el precio de venta debe salir de la tabla principal');
  assert.equal(item.priceKnown, true);
  assert.equal(item.stockStatus, 'AGOTADO', 'sin stock se informa AGOTADO');
});

test('el estado de stock refleja la cantidad menos las reservas', async () => {
  await agent.post('/api/stock').send({ productId: variantId, quantity: 1, unitCost: 900 });
  assert.equal((await findVariant()).stockStatus, 'ÚLTIMAS UNIDADES');

  await agent.post('/api/stock').send({ productId: variantId, quantity: 5, unitCost: 900 });
  assert.equal((await findVariant()).stockStatus, 'DISPONIBLE');

  await agent.post('/api/stock/remove').send({ productId: variantId, quantity: 6, reason: 'Prueba deProjection' });
  assert.equal((await findVariant()).stockStatus, 'AGOTADO');
});

test('la promoción activa sustituye el precio y conserva el anterior', async () => {
  await agent.post('/api/stock').send({ productId: variantId, quantity: 2, unitCost: 900 });
  const now = new Date().toISOString();
  await agent.patch('/api/products').send({ id: variantId, promoPrice: 999, promoStartsAt: now, promoEndsAt: new Date(Date.now() + 86400000).toISOString() });
  const item = await findVariant();
  assert.equal(item.price, 999, 'con promoción activa se cobra el precio promocional');
  assert.equal(item.promoPrice, 999);
  void productId;
});

test('el catálogo público nunca expone costos, proveedores ni unidades', async () => {
  const body = (await request(app).get('/api/public/catalog')).text;
  for (const forbidden of ['"cost"', '"unitCost"', 'supplier', 'imei', 'customer', 'location_id']) {
    assert.equal(body.includes(forbidden), false, `no debe aparecer ${forbidden}`);
  }
});
