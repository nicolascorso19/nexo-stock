import express from 'express';
import { requireCsrf } from '../lib/auth-guard.js';
import { getOrCreateCart } from '../services/cart.js';
import { quoteCart } from '../services/quote.js';
import { createOrder, getOrder, getOrderForCustomer, getOrderForGuest, cancelOrder } from '../services/orders.js';
import { createPayment, getPaymentProvider } from '../services/payments.js';
import { getPublicSettings } from '../services/settings.js';
import { AppError } from '../lib/errors.js';
import { getDatabase } from '../db/database.js';
import { registerCustomer } from '../services/auth.js';

export function checkoutRouter({ config, catalogClient, paymentProvider = getPaymentProvider(config) }) {
  const router = express.Router();
  router.post('/quote', requireCsrf(config), async (req, res) => {
    const cart = getOrCreateCart(req, res, config);
    const catalog = await catalogClient.getCatalog({ fresh: true });
    if (catalog._stale) throw new AppError('Estamos verificando la disponibilidad del producto. Intentá nuevamente en unos segundos.', { status: 503, code: 'STOCK_AVAILABILITY_UNKNOWN' });
    const input = req.body || {};
    const quote = quoteCart({ cart, catalog, couponCode: input.couponCode, customerId: req.storeSession?.kind === 'customer' ? req.storeSession.id : cart.customer_id, fulfillmentMethod: input.fulfillmentMethod || 'PICKUP', locality: input.address?.locality, postalCode: input.address?.postalCode, config });
    res.json({ data: { quote, store: getPublicSettings() } });
  });

  router.post('/orders', requireCsrf(config), async (req, res) => {
    const cart = getOrCreateCart(req, res, config);
    const key = String(req.get('Idempotency-Key') || req.body?.idempotencyKey || '').trim();
    if (!/^[A-Za-z0-9._:-]{8,120}$/.test(key)) throw new AppError('Se requiere una clave de idempotencia válida.', { status: 400, code: 'IDEMPOTENCY_KEY_REQUIRED' });
    let customer = req.storeSession?.kind === 'customer' ? req.storeSession : null;
    let createdAccount = false;
    if (!customer && req.body?.createAccount && req.body?.password) {
      const account = await registerCustomer(req.body, req, res, config);
      customer = { id: account.userId, kind: 'customer', email: req.body.email };
      createdAccount = true;
    }
    const result = await createOrder({ cart, customer, input: { ...req.body, idempotencyKey: key }, config, catalogClient, paymentProvider });
    if (createdAccount && result.order?.id) getDatabase().prepare('UPDATE orders SET customer_id = ? WHERE id = ?').run(customer.id, result.order.id);
    res.status(201).json({ data: { ...result, accountCreated: createdAccount } });
  });

  router.get('/methods', (_req, res) => res.json({ data: getPublicSettings(config).payments }));

  router.get('/orders/:number', (req, res) => {
    const token = String(req.query.token || req.get('X-Order-Token') || '');
    const order = req.storeSession?.kind === 'customer' ? getOrderForCustomer(req.storeSession.id, Number(req.params.number) || findOrderId(req.params.number)) : getOrderForGuest(req.params.number, token);
    res.json({ data: order });
  });

  router.post('/orders/:number/payment', requireCsrf(config), async (req, res) => {
    const order = accessOrder(req, req.params.number);
    if (!['PENDING_PAYMENT', 'FULFILLMENT_REVIEW'].includes(order.status)) throw new AppError('El pedido no admite un nuevo pago.', { status: 409, code: 'ORDER_NOT_PAYABLE' });
    const payment = await createPayment({ order: getOrder(order.id, { includePrivate: true }), method: req.body?.paymentMethod, provider: paymentProvider, config });
    res.json({ data: { order: getOrder(order.id), payment } });
  });

  router.post('/orders/:number/cancel', requireCsrf(config), async (req, res) => {
    const order = accessOrder(req, req.params.number);
    const result = await cancelOrder({ orderId: order.id, customerId: req.storeSession?.kind === 'customer' ? req.storeSession.id : null, reason: req.body?.reason, catalogClient, provider: paymentProvider, actor: req.storeSession?.kind === 'customer' ? 'CUSTOMER' : 'ADMIN' });
    res.json({ data: result });
  });

  return router;
}

function accessOrder(req, number) {
  const token = String(req.body?.token || req.query?.token || req.get('X-Order-Token') || '');
  if (req.storeSession?.kind === 'customer') return getOrderForCustomer(req.storeSession.id, findOrderId(number));
  return getOrderForGuest(number, token);
}

function findOrderId(number) {
  const id = Number(number);
  if (Number.isInteger(id) && id > 0) return id;
  const row = getDatabaseSafe().prepare('SELECT id FROM orders WHERE order_number = ?').get(String(number).toUpperCase());
  if (!row) throw new AppError('Pedido no encontrado.', { status: 404, code: 'ORDER_NOT_FOUND' });
  return row.id;
}

function getDatabaseSafe() {
  return getDatabase();
}
