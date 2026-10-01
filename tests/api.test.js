import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import request from 'supertest';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexo-api-test-'));
process.env.NODE_ENV = 'test';
process.env.DATA_DIR = tempDir;
process.env.DB_PATH = path.join(tempDir, 'test.sqlite');
process.env.COOKIE_SECURE = 'false';
process.env.LOGIN_RATE_LIMIT = '1000';
process.env.BCRYPT_ROUNDS = '10';
process.env.SEED_DEMO = 'true';

const [{ createApp }, { createDatabase, closeDatabase }, { bootstrapState }, { makeLuhnImei }] = await Promise.all([
  import('../server/app.js'),
  import('../server/db/database.js'),
  import('../server/db/bootstrap.js'),
  import('../server/utils.js')
]);

const db = createDatabase(process.env.DB_PATH, { seed: true });
const app = createApp({ db });
let imeiSequence = 1;
const nextImei = () => makeLuhnImei(`9900000000${String(imeiSequence++).padStart(4, '0')}`);

async function login(agent, email = 'admin@nexo.com', password = 'admin123') {
  const response = await agent.post('/api/auth/login').send({ email, password });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  return response;
}
async function bootstrap(agent) { return (await agent.get('/api/bootstrap')).body; }
async function createProduct(agent, payload) {
  const response = await agent.post('/api/products').send({ published: true, variantPublished: true, ...payload });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  return response.body.data;
}
async function createVariant(agent, parentId, payload) {
  const response = await agent.post(`/api/products/${encodeURIComponent(parentId)}/variants`).send(payload);
  assert.equal(response.status, 201, JSON.stringify(response.body));
  return response.body.data;
}
async function addStock(agent, productId, quantity, unitCost, imeis = []) {
  const response = await agent.post('/api/stock').send({ productId, quantity, unitCost, imeis });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  return response.body;
}
async function createCustomer(agent, payload = {}) {
  const response = await agent.post('/api/customers').send({ firstName: 'Juan', lastName: 'Pérez', taxId: '40.123.456', ...payload });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  return response.body.data;
}

describe('NEXO API v3', { concurrency: false }, () => {
  before(() => {
    const state = bootstrapState(db);
    assert.ok(state.products.length > 0, 'El catálogo inicial debe existir');
    assert.equal(state.products.filter(product => product.stock > 0).length, 0, 'El stock inicial debe ser cero');
    assert.equal(state.units.length, 0, 'No debe haber IMEI iniciales');
    assert.equal(state.sales.length, 0, 'No debe haber ventas iniciales');
    assert.equal(state.purchases.length, 0, 'No debe haber compras iniciales');
    assert.equal(state.customers.length, 0, 'No debe haber clientes iniciales');
    assert.equal(state.suppliers.length, 0, 'No debe haber proveedores iniciales');
    assert.equal(state.movements.length, 0, 'No debe haber movimientos iniciales');
    assert.equal(state.settings.currency, 'USD');
    assert.equal(state.settings.locationName, 'Córdoba Capital');
  });
  after(() => {
    if (db.open) closeDatabase(db);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('login, sesión HttpOnly y cierre de sesión', async () => {
    const agent = request.agent(app);
    const response = await login(agent);
    assert.equal(response.body.data.user.role, 'Administrador');
    assert.match(String(response.headers['set-cookie']), /HttpOnly/i);
    assert.match(String(response.headers['set-cookie']), /SameSite=Strict/i);
    assert.equal((await agent.get('/api/auth/me')).status, 200);
    assert.equal((await agent.post('/api/auth/logout').send({})).status, 200);
    assert.equal((await agent.get('/api/auth/me')).status, 401);
  });

  test('roles y permisos se aplican en backend', async () => {
    const seller = request.agent(app); await login(seller, 'vendedor@nexo.com', 'vendedor123');
    assert.equal((await seller.post('/api/products').send({ brand: 'Test', model: 'Blocked', price: 200, cost: 100, salePriceRegistered: true, costRegistered: true })).status, 403);
    const inventory = request.agent(app); await login(inventory, 'inventario@nexo.com', 'inventario123');
    assert.equal((await inventory.post('/api/products').send({ brand: 'Test', model: 'Blocked', price: 200, cost: 100, salePriceRegistered: true, costRegistered: true })).status, 403);
    assert.equal((await inventory.get('/api/admin/inventory-check')).status, 403);
  });

  test('variantes independientes: stock 5, ventas 1+1, error por stock y otra variante', async () => {
    const agent = request.agent(app); await login(agent);
    const first = await createProduct(agent, { brand: 'Apple', model: 'iPhone 17 Test', category: 'Celulares', capacity: '256GB', color: 'Negro', condition: 'Nuevo', requiresImei: false, cost: 100, costRegistered: true, salePrice: 200, salePriceRegistered: true });
    const second = await createVariant(agent, first.productId, { capacity: '512GB', color: 'Negro', condition: 'Nuevo', requiresImei: false, cost: 150, costRegistered: true, salePrice: 300, salePriceRegistered: true });
    await addStock(agent, first.id, 5, 100);
    await addStock(agent, second.id, 2, 150);
    const firstSale = await agent.post('/api/sales').set('Idempotency-Key', 'variant-sale-1').send({ paymentMethod: 'Efectivo', items: [{ productId: first.id, quantity: 1, price: 200 }] });
    assert.equal(firstSale.status, 201, JSON.stringify(firstSale.body));
    const secondSale = await agent.post('/api/sales').set('Idempotency-Key', 'variant-sale-2').send({ paymentMethod: 'Efectivo', items: [{ productId: first.id, quantity: 1, price: 200 }] });
    assert.equal(secondSale.status, 201, JSON.stringify(secondSale.body));
    const rejected = await agent.post('/api/sales').set('Idempotency-Key', 'variant-rejected').send({ paymentMethod: 'Efectivo', items: [{ productId: first.id, quantity: 4, price: 200 }] });
    assert.equal(rejected.status, 409);
    let state = await bootstrap(agent);
    assert.equal(state.products.find(product => product.id === first.id).stock, 3);
    const otherSale = await agent.post('/api/sales').set('Idempotency-Key', 'variant-sale-other').send({ paymentMethod: 'Efectivo', items: [{ productId: second.id, quantity: 1, price: 300 }] });
    assert.equal(otherSale.status, 201, JSON.stringify(otherSale.body));
    state = await bootstrap(agent);
    assert.equal(state.products.find(product => product.id === first.id).stock, 3);
    assert.equal(state.products.find(product => product.id === second.id).stock, 1);
  });

  test('cliente, venta, anulación, IMEI y movimiento inverso son transaccionales', async () => {
    const agent = request.agent(app); await login(agent);
    const customer = await createCustomer(agent, { taxId: '40.999.888' });
    const product = await createProduct(agent, { brand: 'Apple', model: 'iPhone IMEI Test', category: 'Celulares', capacity: '256GB', color: 'Negro', condition: 'Nuevo', requiresImei: true, cost: 1000, costRegistered: true, salePrice: 1400, salePriceRegistered: true });
    const imeis = [nextImei(), nextImei()];
    await addStock(agent, product.id, 2, 1000, imeis);
    const before = await bootstrap(agent);
    const unit = before.units.find(item => item.productId === product.id && item.status === 'Disponible');
    const sale = await agent.post('/api/sales').set('Idempotency-Key', 'imei-sale').send({ customerId: customer.id, paymentMethod: 'Efectivo', items: [{ productId: product.id, quantity: 1, price: 1400, unitId: unit.id }] });
    assert.equal(sale.status, 201, JSON.stringify(sale.body));
    assert.equal(sale.body.data.customerId, customer.id);
    let state = await bootstrap(agent);
    assert.equal(state.products.find(item => item.id === product.id).stock, 1);
    assert.equal(state.units.find(item => item.id === unit.id).status, 'Vendido');
    const duplicate = await agent.post('/api/stock').send({ productId: product.id, quantity: 1, unitCost: 1000, imeis: [imeis[0]] });
    assert.equal(duplicate.status, 409);
    const annul = await agent.post(`/api/sales/${sale.body.data.id}/annul`).send({ reason: 'Prueba de anulación' });
    assert.equal(annul.status, 200, JSON.stringify(annul.body));
    state = await bootstrap(agent);
    assert.equal(annul.body.data.status, 'ANULADA');
    assert.equal(state.products.find(item => item.id === product.id).stock, 2);
    assert.equal(state.units.find(item => item.id === unit.id).status, 'Disponible');
    assert.ok(state.movements.some(item => item.referenceType === 'sale_annulment' && item.productId === product.id && item.quantity === 1));
  });

  test('devolución devuelve stock y conserva la venta original', async () => {
    const agent = request.agent(app); await login(agent);
    const customer = await createCustomer(agent, { taxId: '41.111.222' });
    const product = await createProduct(agent, { brand: 'Generic', model: 'Return Test', category: 'Accesorios', requiresImei: false, cost: 20, costRegistered: true, salePrice: 50, salePriceRegistered: true });
    await addStock(agent, product.id, 2, 20);
    const sale = await agent.post('/api/sales').send({ customerId: customer.id, paymentMethod: 'Efectivo', items: [{ productId: product.id, quantity: 1, price: 50 }] });
    assert.equal(sale.status, 201, JSON.stringify(sale.body));
    const returned = await agent.post(`/api/sales/${sale.body.data.id}/returns`).send({ reason: 'Producto devuelto', items: [{ saleItemId: sale.body.data.items[0].id, quantity: 1, restocked: true }] });
    assert.equal(returned.status, 201, JSON.stringify(returned.body));
    const state = await bootstrap(agent);
    assert.equal(state.products.find(item => item.id === product.id).stock, 2);
    assert.equal(state.sales.find(item => item.id === sale.body.data.id).statusCode, 'ACTIVE');
    assert.equal(state.returns.length >= 1, true);
  });

  test('precio Apple editable, web pública y AGOTADO con stock cero', async () => {
    const agent = request.agent(app); await login(agent);
    const product = await createProduct(agent, { brand: 'Apple', model: 'iPhone Public Test', category: 'Celulares', capacity: '256GB', color: 'Negro', requiresImei: false, salePrice: 1299, salePriceRegistered: true, published: true, variantPublished: true });
    const price = await agent.patch(`/api/products/${product.id}/apple-price`).send({ appleOfficialPriceUsd: 1199, source: 'Apple.com' });
    assert.equal(price.status, 200, JSON.stringify(price.body));
    assert.equal(price.body.data.appleOfficialPriceUsd, 1199);
    const publicResponse = await request(app).get('/api/public/catalog');
    assert.equal(publicResponse.status, 200);
    const publicProduct = publicResponse.body.data.products.find(item => item.id === product.id);
    assert.equal(publicProduct.price, 1299);
    assert.equal(publicProduct.stockStatus, 'AGOTADO');
    await addStock(agent, product.id, 1, 1000);
    const publicAfter = (await request(app).get('/api/public/catalog')).body.data.products.find(item => item.id === product.id);
    assert.equal(publicAfter.stockStatus, 'ÚLTIMAS UNIDADES');
  });

  test('conciliación detecta y permite ajustar sólo con motivo', async () => {
    const agent = request.agent(app); await login(agent);
    const check = await agent.get('/api/admin/inventory-check');
    assert.equal(check.status, 200);
    assert.equal(check.body.data.ok, true);
    const blocked = await agent.post('/api/admin/inventory-check').send({ variantId: 'missing', physicalStock: 1, reason: '' });
    assert.equal(blocked.status, 422);
  });

  test('clientes duplicados por DNI, rollback de stock e importación atómica', async () => {
    const agent = request.agent(app); await login(agent);
    await createCustomer(agent, { taxId: '42.222.333' });
    const duplicateCustomer = await agent.post('/api/customers').send({ name: 'Otro', taxId: '42.222.333' });
    assert.equal(duplicateCustomer.status, 409);
    const product = await createProduct(agent, { brand: 'Generic', model: 'Import Atomic', category: 'Accesorios', requiresImei: false, salePrice: 20, salePriceRegistered: true });
    const before = (await bootstrap(agent)).products.length;
    const failed = await agent.post('/api/products/import').send({ rows: [
      { brand: 'Generic', model: 'Import Row A', category: 'Accesorios', price: 20, salePriceRegistered: true, stock: 0, requiresImei: false },
      { brand: 'Generic', model: 'Import Row B', category: 'Accesorios', price: 20, salePriceRegistered: true, stock: 0, requiresImei: false, sku: product.sku }
    ] });
    assert.equal(failed.status, 409);
    assert.equal((await bootstrap(agent)).products.length, before);
  });

  test('los descuentos de línea y cabecera se descuentan una sola vez', async () => {
    const agent = request.agent(app); await login(agent);
    const product = await createProduct(agent, { brand: 'Pricing', model: 'Discount Test', category: 'Otros', requiresImei: false, cost: 10, costRegistered: true, salePrice: 50, salePriceRegistered: true });
    await addStock(agent, product.id, 4, 10);
    const sale = await agent.post('/api/sales').set('Idempotency-Key', 'discount-sale').send({
      paymentMethod: 'Efectivo',
      discount: 3,
      items: [{ productId: product.id, quantity: 2, price: 50, discount: 7 }]
    });
    assert.equal(sale.status, 201, JSON.stringify(sale.body));
    assert.equal(sale.body.data.total, 90);
    assert.equal(sale.body.data.items[0].total, 93);
  });

  test('una devolución parcial seguida de anulación no duplica el stock', async () => {
    const agent = request.agent(app); await login(agent);
    const product = await createProduct(agent, { brand: 'Returns', model: 'Partial Annul', category: 'Otros', requiresImei: false, cost: 4, costRegistered: true, salePrice: 8, salePriceRegistered: true });
    await addStock(agent, product.id, 5, 4);
    const sale = await agent.post('/api/sales').send({ paymentMethod: 'Efectivo', items: [{ productId: product.id, quantity: 5, price: 8 }] });
    assert.equal(sale.status, 201, JSON.stringify(sale.body));
    const saleItemId = sale.body.data.items[0].id;
    const duplicated = await agent.post(`/api/sales/${sale.body.data.id}/returns`).send({ reason: 'Duplicada', items: [{ saleItemId, quantity: 1 }, { saleItemId, quantity: 1 }] });
    assert.equal(duplicated.status, 422);
    const returned = await agent.post(`/api/sales/${sale.body.data.id}/returns`).send({ reason: 'Parcial', items: [{ saleItemId, quantity: 2, restocked: true }] });
    assert.equal(returned.status, 201, JSON.stringify(returned.body));
    assert.equal(returned.body.data.status, 'Parcial');
    assert.equal(returned.body.state.products.find(item => item.id === product.id).stock, 2);
    const annulled = await agent.post(`/api/sales/${sale.body.data.id}/annul`).send({ reason: 'Cierre de prueba' });
    assert.equal(annulled.status, 200, JSON.stringify(annulled.body));
    assert.equal(annulled.body.state.products.find(item => item.id === product.id).stock, 5);
  });

  test('backup y restore preservan publicación, Apple, reservas y nombres de cliente', async () => {
    const agent = request.agent(app); await login(agent);
    const customer = await createCustomer(agent, { taxId: '43.444.555', firstName: 'Luis', lastName: 'Gómez' });
    const product = await createProduct(agent, {
      brand: 'Backup', model: 'Roundtrip', category: 'Accesorios', capacity: '256GB', color: 'Negro',
      requiresImei: true, cost: 100, costRegistered: true, salePrice: 200, salePriceRegistered: true,
      published: true, variantPublished: true, publicSlug: 'backup-roundtrip', publicDescription: 'Descripción pública',
      appleOfficialPriceUsd: 199, applePriceSource: 'Test'
    });
    const imei = nextImei();
    await addStock(agent, product.id, 1, 100, [imei]);
    const before = await bootstrap(agent);
    const unit = before.units.find(item => item.productId === product.id && item.status === 'Disponible');
    const sale = await agent.post('/api/sales').send({ customerId: customer.id, paymentMethod: 'Efectivo', items: [{ productId: product.id, quantity: 1, price: 200, unitId: unit.id }] });
    assert.equal(sale.status, 201, JSON.stringify(sale.body));
    const reservationCustomer = await createCustomer(agent, { taxId: '43.444.556' });
    const reservationProduct = await createProduct(agent, { brand: 'Backup', model: 'Reserved', category: 'Accesorios', requiresImei: true, cost: 50, costRegistered: true, salePrice: 100, salePriceRegistered: true });
    const reservedImei = nextImei();
    await addStock(agent, reservationProduct.id, 1, 50, [reservedImei]);
    const reserveState = await bootstrap(agent);
    const reservedUnit = reserveState.units.find(item => item.productId === reservationProduct.id && item.status === 'Disponible');
    const reservation = await agent.post('/api/reservations').send({ unitId: reservedUnit.id, customerId: reservationCustomer.id, expiresAt: '2099-12-31' });
    assert.equal(reservation.status, 201, JSON.stringify(reservation.body));
    const backupResponse = await agent.get('/api/admin/backup');
    assert.equal(backupResponse.status, 200);
    const restored = await agent.post('/api/admin/backup/restore').send({ backup: backupResponse.body });
    assert.equal(restored.status, 200, JSON.stringify(restored.body));
    const after = await bootstrap(agent);
    const restoredProduct = after.products.find(item => item.id === product.id);
    assert.equal(restoredProduct.published, true);
    assert.equal(restoredProduct.variantPublished, true);
    assert.equal(restoredProduct.appleOfficialPriceUsd, 199);
    assert.equal(restoredProduct.publicSlug, 'backup-roundtrip');
    assert.equal(after.customers.find(item => item.id === customer.id).firstName, 'Luis');
    assert.equal(after.sales.find(item => item.id === sale.body.data.id).total, 200);
    assert.equal(after.products.find(item => item.id === reservationProduct.id).reservedStock, 1);
  });

  test('una reserva vencida libera la unidad antes de vender', async () => {
    const agent = request.agent(app); await login(agent);
    const customer = await createCustomer(agent, { taxId: '44.555.666' });
    const product = await createProduct(agent, { brand: 'Expiry', model: 'Reservation Expiry', category: 'Otros', requiresImei: true, cost: 10, costRegistered: true, salePrice: 20, salePriceRegistered: true });
    const imei = nextImei();
    await addStock(agent, product.id, 1, 10, [imei]);
    const before = await bootstrap(agent);
    const unit = before.units.find(item => item.productId === product.id && item.status === 'Disponible');
    const reservation = await agent.post('/api/reservations').send({ unitId: unit.id, customerId: customer.id, expiresAt: '2099-01-01T00:00:00.000Z' });
    assert.equal(reservation.status, 201, JSON.stringify(reservation.body));
    db.prepare('UPDATE reservations SET expires_at = ? WHERE id = ?').run('2000-01-01T00:00:00.000Z', reservation.body.data.id);
    const sale = await agent.post('/api/sales').send({ customerId: customer.id, paymentMethod: 'Efectivo', items: [{ productId: product.id, quantity: 1, price: 20, unitId: unit.id }] });
    assert.equal(sale.status, 201, JSON.stringify(sale.body));
    const after = await bootstrap(agent);
    assert.equal(after.units.find(item => item.id === unit.id).status, 'Vendido');
    assert.equal(after.reservations.find(item => item.id === reservation.body.data.id).status, 'Expirada');
    assert.equal(after.products.find(item => item.id === product.id).reservedStock, 0);
  });

  test('restablecer datos iniciales elimina actividad y conserva catálogo en cero', async () => {
    const agent = request.agent(app); await login(agent);
    const response = await agent.post('/api/admin/reset-empty').send({});
    assert.equal(response.status, 200, JSON.stringify(response.body));
    const state = response.body.state;
    assert.ok(state.products.length > 0);
    assert.equal(state.sales.length, 0);
    assert.equal(state.purchases.length, 0);
    assert.equal(state.customers.length, 0);
    assert.equal(state.units.length, 0);
    assert.equal(state.products.filter(product => product.stock > 0).length, 0);
  });

  test('frontend y archivos internos permanecen protegidos', async () => {
    const page = await request(app).get('/');
    assert.equal(page.status, 200);
    assert.match(page.text, /id="app"/);
    assert.match(page.headers['content-security-policy'], /default-src 'self'/);
    assert.equal((await request(app).get('/server/app.js')).status, 404);
    assert.equal((await request(app).get('/data/nexo.sqlite')).status, 404);
  });
});
