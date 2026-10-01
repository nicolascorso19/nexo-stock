import test from 'node:test';
import assert from 'node:assert/strict';
import { createDatabase, closeDatabase } from '../server/db/database.js';
import { getConfig } from '../server/config.js';
import { createApp } from '../server/app.js';
import { ensureCommerceRuntime } from '../server/services/commerce.js';
import { CatalogClient } from '../ecommerce/src/services/catalog-client.js';

const KEY_ID = 'safety-store';
const SECRET = 'z'.repeat(48);

function publishFixture(db, { fictional, quantity = 2, price = 100 }) {
  const variant = db.prepare('SELECT id, product_id FROM product_variants WHERE requires_imei = 0 LIMIT 1').get();
  const now = new Date().toISOString();
  db.prepare('UPDATE products SET published = 1, published_at = ?, public_description = ?, is_fictional = ? WHERE id = ?')
    .run(now, 'Fixture de seguridad', fictional ? 1 : 0, variant.product_id);
  db.prepare('UPDATE product_variants SET published = 1, sale_price = ?, sale_price_registered = 1, promo_price = NULL, is_fictional = ? WHERE id = ?')
    .run(price, fictional ? 1 : 0, variant.id);
  db.prepare('UPDATE inventory SET quantity = ?, reserved_quantity = 0, updated_at = ? WHERE variant_id = ?')
    .run(quantity, now, variant.id);
  return variant.id;
}

async function withServer(env, run) {
  const config = getConfig({ NODE_ENV: 'test', COMMERCE_API_KEY_ID: KEY_ID, COMMERCE_API_SECRET: SECRET, COOKIE_SECURE: 'false', ...env });
  const db = createDatabase(':memory:', { seed: true });
  ensureCommerceRuntime(db, config);
  const server = createApp({ db, config }).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const client = new CatalogClient({ stockApi: { baseUrl: `http://127.0.0.1:${server.address().port}`, keyId: KEY_ID, secret: SECRET, timeoutMs: 2000 } });
  try {
    return await run({ db, config, client });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    closeDatabase(db);
  }
}

test('fictional products never reach the public catalog by default', async () => {
  await withServer({}, async ({ db, client }) => {
    publishFixture(db, { fictional: true });
    const catalog = await client.getCatalog({ fresh: true });
    assert.equal(catalog.products.length, 0, 'el catálogo no debe exponer datos ficticios');
  });
});

test('a fictional variant cannot be reserved by default', async () => {
  await withServer({}, async ({ db, client }) => {
    const variantId = publishFixture(db, { fictional: true, quantity: 5 });
    await assert.rejects(
      () => client.reserve({ externalOrderId: 'FICT-1', idempotencyKey: 'fict-1', items: [{ variantId, quantity: 1 }] }),
      (error) => error.status === 404 || error.code === 'NOT_FOUND',
      'una variante ficticia no debe reservarse'
    );
    assert.equal(db.prepare('SELECT reserved_quantity FROM inventory WHERE variant_id = ?').get(variantId).reserved_quantity, 0);
  });
});

test('production refuses to enable fictional data', async () => {
  assert.throws(
    () => getConfig({ NODE_ENV: 'production', COOKIE_SECURE: 'true', SEED_DEMO: 'false', COMMERCE_INCLUDE_FICTIONAL: 'true' }),
    /COMMERCE_INCLUDE_FICTIONAL/,
    'producción no debe habilitar datos ficticios'
  );
});

test('the dev opt-in exposes fictional data for local review only', async () => {
  await withServer({ COMMERCE_INCLUDE_FICTIONAL: 'true' }, async ({ db, client }) => {
    const variantId = publishFixture(db, { fictional: true, quantity: 3 });
    const catalog = await client.getCatalog({ fresh: true });
    assert.equal(catalog.products.length, 1, 'con la opción de desarrollo el catálogo se revisa');
    const hold = await client.reserve({ externalOrderId: 'DEV-1', idempotencyKey: 'dev-1', items: [{ variantId, quantity: 1 }] });
    assert.equal(db.prepare('SELECT reserved_quantity FROM inventory WHERE variant_id = ?').get(variantId).reserved_quantity, 1);
    const confirmed = await client.confirmReservation(hold.reservationId, { externalOrderId: 'DEV-1', idempotencyKey: 'dev-confirm-1' });
    assert.ok(confirmed.saleId, 'el flujo de venta funciona también en desarrollo');
  });
});
