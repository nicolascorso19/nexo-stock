import test from 'node:test';
import assert from 'node:assert/strict';
import { createDatabase, closeDatabase } from '../server/db/database.js';
import { getConfig } from '../server/config.js';
import { createApp } from '../server/app.js';
import { ensureCommerceRuntime } from '../server/services/commerce.js';
import { CatalogClient } from '../ecommerce/src/services/catalog-client.js';

let db;
let server;
let baseUrl;
let client;
let variantId;

test.before(async () => {
  const config = getConfig({ NODE_ENV: 'test', COMMERCE_API_KEY_ID: 'test-store', COMMERCE_API_SECRET: 's'.repeat(48), COOKIE_SECURE: 'false' });
  db = createDatabase(':memory:', { seed: true });
  ensureCommerceRuntime(db, config);
  const variant = db.prepare('SELECT id, product_id FROM product_variants WHERE requires_imei = 0 LIMIT 1').get();
  assert.ok(variant, 'the fixture needs a quantity-managed variant');
  variantId = variant.id;
  const now = new Date().toISOString();
  db.prepare('UPDATE products SET published = 1, published_at = ?, public_description = ? WHERE id = ?').run(now, 'Fixture de integración', variant.product_id);
  db.prepare('UPDATE product_variants SET published = 1, sale_price = 25, sale_price_registered = 1, promo_price = NULL WHERE id = ?').run(variantId);
  db.prepare('UPDATE inventory SET quantity = 1, reserved_quantity = 0, updated_at = ? WHERE variant_id = ?').run(now, variantId);
  const app = createApp({ db, config });
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  client = new CatalogClient({ stockApi: { baseUrl, keyId: 'test-store', secret: 's'.repeat(48), timeoutMs: 2000 } });
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  closeDatabase(db);
});

test('catalog and quantity holds use the private database atomically', async () => {
  const catalog = await client.getCatalog({ fresh: true });
  const variant = catalog.products.flatMap((product) => product.variants).find((item) => item.id === variantId);
  assert.equal(variant.availableQuantity, 1);
  assert.equal(variant.price, 25);
  assert.equal(JSON.stringify(catalog).includes('cost'), false);
  assert.equal(JSON.stringify(catalog).match(/\b\d{15}\b/g), null);

  const hold = await client.reserve({ externalOrderId: 'ECOM-TEST-1', idempotencyKey: 'reserve-test-1', items: [{ variantId, quantity: 1 }] });
  assert.match(hold.reservationId, /^commerce_hold_/);
  assert.equal(db.prepare('SELECT reserved_quantity FROM inventory WHERE variant_id = ?').get(variantId).reserved_quantity, 1);

  await assert.rejects(() => client.reserve({ externalOrderId: 'ECOM-TEST-2', idempotencyKey: 'reserve-test-2', items: [{ variantId, quantity: 1 }] }), (error) => error.code === 'INSUFFICIENT_STOCK');

  const confirmed = await client.confirmReservation(hold.reservationId, { externalOrderId: 'ECOM-TEST-1', idempotencyKey: 'confirm-test-1' });
  assert.ok(confirmed.saleId);
  assert.equal(db.prepare('SELECT quantity, reserved_quantity FROM inventory WHERE variant_id = ?').get(variantId).quantity, 0);
  assert.equal(db.prepare('SELECT status FROM sales WHERE id = ?').get(confirmed.saleId).status, 'ACTIVE');
});

test('two concurrent reservations for the last unit cannot oversell', async () => {
  const variant = db.prepare('SELECT id, product_id FROM product_variants WHERE requires_imei = 0 AND id <> ? LIMIT 1').get(variantId);
  const now = new Date().toISOString();
  db.prepare('UPDATE products SET published = 1, published_at = ? WHERE id = ?').run(now, variant.product_id);
  db.prepare('UPDATE product_variants SET published = 1, sale_price = 30, sale_price_registered = 1 WHERE id = ?').run(variant.id);
  db.prepare('UPDATE inventory SET quantity = 1, reserved_quantity = 0, updated_at = ? WHERE variant_id = ?').run(now, variant.id);
  const results = await Promise.allSettled([
    client.reserve({ externalOrderId: 'RACE-A', idempotencyKey: 'race-a', items: [{ variantId: variant.id, quantity: 1 }] }),
    client.reserve({ externalOrderId: 'RACE-B', idempotencyKey: 'race-b', items: [{ variantId: variant.id, quantity: 1 }] })
  ]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter((result) => result.status === 'rejected' && result.reason.code === 'INSUFFICIENT_STOCK').length, 1);
  assert.equal(db.prepare('SELECT reserved_quantity FROM inventory WHERE variant_id = ?').get(variant.id).reserved_quantity, 1);
});

test('replaying confirmation does not decrement stock twice', async () => {
  const hold = await client.reserve({ externalOrderId: 'ECOM-TEST-3', idempotencyKey: 'reserve-test-3', items: [{ variantId, quantity: 0 }] }).catch(() => null);
  // The fixture is sold out after the first test; the assertion below is intentionally
  // about the existing confirmed hold, not a fabricated second sale.
  assert.equal(hold, null);
  const existing = db.prepare("SELECT * FROM commerce_holds WHERE external_order_id = 'ECOM-TEST-1'").get();
  const replay = await client.confirmReservation(existing.id, { externalOrderId: 'ECOM-TEST-1', idempotencyKey: 'confirm-test-1' });
  assert.equal(replay.hold.status, 'CONFIRMED');
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM sales WHERE id = ?').get(replay.saleId).count, 1);
});
