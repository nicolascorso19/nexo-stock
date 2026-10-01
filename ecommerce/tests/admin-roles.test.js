import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { getConfig } from '../src/config.js';
import { openDatabase, closeDatabase } from '../src/db/database.js';
import { createApp } from '../src/app.js';
import { createAdminUser } from '../src/services/auth.js';

/**
 * Separación de roles y límites de intentos.
 *
 * Antes los tres roles entraban a todo el panel, así que un gestor de contenido
 * podía leer los datos bancarios y aprobar reembolsos. Y el login sólo estaba
 * cubierto por el límite global de 300/min, que no frena fuerza bruta.
 */

let app;
let config;
const agents = {};

async function adminAgentFor(role) {
  if (agents[role]) return agents[role];
  await createAdminUser({ name: `Gestor ${role}`, email: `${role.toLowerCase()}@store.test`, password: 'secure-pass-123', role });
  const agent = request.agent(app);
  const pre = await agent.get('/api/auth/session').expect(200);
  const login = await agent.post('/api/admin/auth/login').set('X-CSRF-Token', pre.body.data.csrfToken).send({ email: `${role.toLowerCase()}@store.test`, password: 'secure-pass-123' }).expect(200);
  agents[role] = { agent, csrf: login.body.data.csrfToken };
  return agents[role];
}

before(() => {
  config = getConfig({ NODE_ENV: 'test', DB_PATH: ':memory:', PUBLIC_BASE_URL: 'http://localhost:4000', STOCK_API_SECRET: 's'.repeat(48), STOCK_WEBHOOK_SECRET: 'w'.repeat(48), COOKIE_SECURE: 'false' });
  openDatabase(config);
  app = createApp(config, {
    catalogClient: {
      async getCatalog() { return { currency: 'USD', products: [] }; },
      async cancelOrder(id) { return { cancelled: true, id }; },
      async health() { return { ok: true }; }
    },
    paymentProvider: { enabled: () => false, async refund() { return { id: 1, status: 'approved' }; } }
  });
});

after(() => closeDatabase());

test('a CONTENT_MANAGER cannot read store settings, which hold bank details', async () => {
  const { agent, csrf } = await adminAgentFor('CONTENT_MANAGER');
  await agent.get('/api/admin/settings').set('X-CSRF-Token', csrf).expect(403);
  await agent.patch('/api/admin/settings').set('X-CSRF-Token', csrf).send({ brandName: 'Hackeado' }).expect(403);
  // Pero sí edita contenido, que es su trabajo.
  await agent.get('/api/admin/content').set('X-CSRF-Token', csrf).expect(200);
  await agent.get('/api/admin/merchandising').set('X-CSRF-Token', csrf).expect(200);
});

test('a CONTENT_MANAGER cannot approve refunds or confirm payments', async () => {
  const { agent, csrf } = await adminAgentFor('CONTENT_MANAGER');
  await agent.get('/api/admin/refunds').set('X-CSRF-Token', csrf).expect(403);
  await agent.post('/api/admin/refunds/1/approve').set('X-CSRF-Token', csrf).expect(403);
  await agent.post('/api/admin/orders/1/payment/confirm').set('X-CSRF-Token', csrf).send({ paymentId: 1 }).expect(403);
  // Tampoco ve la auditoría ni la cola de correo.
  await agent.get('/api/admin/audit').set('X-CSRF-Token', csrf).expect(403);
  await agent.get('/api/admin/outbox').set('X-CSRF-Token', csrf).expect(403);
});

test('an ORDER_MANAGER sees orders and refunds but not settings nor content', async () => {
  const { agent, csrf } = await adminAgentFor('ORDER_MANAGER');
  await agent.get('/api/admin/orders').set('X-CSRF-Token', csrf).expect(200);
  await agent.get('/api/admin/refunds').set('X-CSRF-Token', csrf).expect(200);
  await agent.get('/api/admin/settings').set('X-CSRF-Token', csrf).expect(403);
  await agent.get('/api/admin/content').set('X-CSRF-Token', csrf).expect(403);
  await agent.get('/api/admin/coupons').set('X-CSRF-Token', csrf).expect(403);
});

test('ADMIN still reaches everything', async () => {
  const { agent, csrf } = await adminAgentFor('ADMIN');
  for (const path of ['/api/admin/dashboard', '/api/admin/orders', '/api/admin/settings', '/api/admin/content', '/api/admin/merchandising', '/api/admin/shipping-zones', '/api/admin/coupons', '/api/admin/refunds', '/api/admin/audit', '/api/admin/errors', '/api/admin/outbox']) {
    await agent.get(path).set('X-CSRF-Token', csrf).expect(200);
  }
});

test('repeated admin logins are rate limited', async () => {
  const agent = request.agent(app);
  const pre = await agent.get('/api/auth/session').expect(200);
  let blocked = false;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const response = await agent.post('/api/admin/auth/login').set('X-CSRF-Token', pre.body.data.csrfToken).send({ email: 'noexiste@store.test', password: 'malaclave-123' });
    if (response.status === 429) { blocked = true; assert.equal(response.body.error.code, 'TOO_MANY_ATTEMPTS'); break; }
  }
  assert.ok(blocked, 'el login del panel debe cortar la fuerza bruta');
});

test('repeated customer logins are rate limited', async () => {
  const agent = request.agent(app);
  const pre = await agent.get('/api/auth/session').expect(200);
  let blocked = false;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const response = await agent.post('/api/auth/login').set('X-CSRF-Token', pre.body.data.csrfToken).send({ email: 'nadie@store.test', password: 'malaclave-123' });
    if (response.status === 429) { blocked = true; break; }
  }
  assert.ok(blocked, 'el login de clientes debe cortar la fuerza bruta');
});
