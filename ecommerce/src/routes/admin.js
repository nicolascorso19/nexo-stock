import express from 'express';
import rateLimit from 'express-rate-limit';
import { requireCsrf, requireSameOrigin } from '../lib/auth-guard.js';
import { getSession, loginAdmin, logout, requireAdmin } from '../services/auth.js';
import { getOrder, updateOrderStatus, confirmPaidOrder, cancelOrder, getOrderForCustomer } from '../services/orders.js';
import { getPaymentProvider } from '../services/payments.js';
import { getPublicSettings, getStoreSettings, updateStoreSettings, upsertContentBlock, getContentBlocks, getShippingZones } from '../services/settings.js';
import { listCoupons, getCoupon, createCoupon, updateCoupon, listAutomaticDiscounts, createAutomaticDiscount } from '../services/coupons.js';
import { analyticsSummary } from '../services/analytics.js';
import { getDatabase } from '../db/database.js';
import { AppError } from '../lib/errors.js';
import { text, oneOf, integer } from '../lib/validation.js';

/** ADMIN ve todo. ORDERS_ROLES opera pedidos y reembolsos; CONTENT_ROLES edita
 *  catálogo y promociones. ADMIN_ONLY queda para lo que toca plata o datos
 *  bancarios: ajustes, confirmar pagos, aprobar reembolsos y ver auditoría. */
const ALL_ROLES = ['ADMIN', 'ORDER_MANAGER', 'CONTENT_MANAGER'];
const ORDERS_ROLES = ['ADMIN', 'ORDER_MANAGER'];
const CONTENT_ROLES = ['ADMIN', 'CONTENT_MANAGER'];
const ADMIN_ONLY = ['ADMIN'];

export function adminRouter({ config, catalogClient, paymentProvider = getPaymentProvider(config) }) {
  const router = express.Router();

  // El login y el logout también cambian estado: se protegen con el token de
  // sesión además del origen, para no dejarlos en un control que se elude
  // simplemente omitiendo la cabecera Origin.
  // El panel maneja costos y pagos: un login sin límite permite fuerza bruta
  // contra la cuenta que puede vaciar la caja.
  const adminLoginLimiter = rateLimit({
    windowMs: 15 * 60_000,
    limit: 8,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: { code: 'TOO_MANY_ATTEMPTS', message: 'Demasiados intentos de acceso. Probá de nuevo en unos minutos.' } }
  });

  router.post('/auth/login', adminLoginLimiter, requireSameOrigin(config), requireCsrf(config), async (req, res) => {
    const result = await loginAdmin(req.body, req, res, config);
    res.json({ data: { authenticated: true, csrfToken: result.csrfToken, user: { kind: 'admin', id: result.userId } } });
  });
  router.get('/auth/session', (req, res) => {
    const session = getSession(req);
    res.json({ data: { authenticated: session?.kind === 'admin', user: session?.kind === 'admin' ? { id: session.id, name: session.name, email: session.email, role: session.role } : null } });
  });
  // Cerrar sesión es una mutación: exige el mismo token CSRF que las demás.
  router.post('/auth/logout', requireCsrf(config), (req, res) => { logout(req, res, config); res.json({ data: { ok: true } }); });

  router.use((req, _res, next) => {
    req.admin = requireAdmin(req, ALL_ROLES);
    next();
  });
  router.use(requireCsrf(config));

  // La guarda general sólo autentica. Cada capacidad se vuelve a comprobar en
  // su grupo: antes los tres roles entraban a todo, así que un gestor de
  // contenido podía leer los datos bancarios y aprobar reembolsos.
  const adminOnly = (req, _res, next) => { req.admin = requireAdmin(req, ADMIN_ONLY); next(); };
  const ordersOnly = (req, _res, next) => { req.admin = requireAdmin(req, ORDERS_ROLES); next(); };
  const contentOnly = (req, _res, next) => { req.admin = requireAdmin(req, CONTENT_ROLES); next(); };

  router.get('/dashboard', ordersOnly, (_req, res) => {
    const db = getDatabase();
    const counts = {
      pending: db.prepare("SELECT COUNT(*) AS count FROM orders WHERE status IN ('PENDING_PAYMENT','PAYMENT_APPROVED','PREPARING')").get().count,
      review: db.prepare("SELECT COUNT(*) AS count FROM orders WHERE status = 'FULFILLMENT_REVIEW'").get().count,
      paid: db.prepare("SELECT COUNT(*) AS count FROM orders WHERE payment_status = 'APPROVED' AND status NOT IN ('CANCELLED','EXPIRED')").get().count,
      customers: db.prepare('SELECT COUNT(*) AS count FROM customers WHERE archived_at IS NULL').get().count
    };
    res.json({ data: { counts, analytics: analyticsSummary() } });
  });

  router.get('/orders', (req, res) => {
    const status = String(req.query.status || '').trim();
    const search = String(req.query.q || '').trim();
    const clauses = [];
    const params = [];
    if (status) { clauses.push('status = ?'); params.push(status); }
    if (search) { clauses.push('(order_number LIKE ? OR email LIKE ? OR first_name LIKE ? OR last_name LIKE ?)'); params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`); }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = getDatabase().prepare(`SELECT id FROM orders ${where} ORDER BY created_at DESC LIMIT 200`).all(...params);
    res.json({ data: rows.map((row) => getOrder(row.id)) });
  });

  router.get('/orders/:id', ordersOnly, (req, res) => res.json({ data: getOrder(Number(req.params.id)) }));

  router.patch('/orders/:id/status', ordersOnly, async (req, res) => {
    const order = updateOrderStatus(Number(req.params.id), oneOf(req.body?.status, ['PAYMENT_APPROVED', 'PREPARING', 'READY_FOR_PICKUP', 'SHIPPED', 'DELIVERED', 'CANCELLED'], 'status'), text(req.body?.note, 'note', { max: 500 }), { type: 'ADMIN', id: req.admin.id });
    res.json({ data: order });
  });

  router.post('/orders/:id/payment/confirm', adminOnly, async (req, res) => {
    const order = getOrder(Number(req.params.id), { includePrivate: true });
    const payment = getDatabase().prepare('SELECT * FROM payments WHERE id = ? AND order_id = ?').get(Number(req.body?.paymentId), order.id);
    if (!payment) throw new AppError('Pago no encontrado.', { status: 404, code: 'PAYMENT_NOT_FOUND' });
    const result = await confirmPaidOrder({ orderId: order.id, paymentId: payment.id, catalogClient, actor: 'ADMIN' });
    res.json({ data: result });
  });

  router.post('/orders/:id/cancel', ordersOnly, async (req, res) => {
    const result = await cancelOrder({ orderId: Number(req.params.id), reason: req.body?.reason, catalogClient, provider: paymentProvider, actor: 'ADMIN' });
    res.json({ data: result });
  });

  router.post('/refunds', ordersOnly, (req, res) => {
    const order = getOrder(Number(req.body?.orderId), { includePrivate: true });
    const amountCents = integer(req.body?.amountCents, 'amountCents', { min: 1, max: order.totals.total * 100 });
    const payment = order.payments.find((item) => item.status === 'APPROVED');
    if (!payment) throw new AppError('El pedido no tiene un pago aprobado.', { status: 409, code: 'PAYMENT_NOT_APPROVED' });
    const result = getDatabase().prepare(`INSERT INTO refund_requests (order_id, payment_id, status, amount_cents, reason, stock_action, requested_by_type, requested_by_id) VALUES (?, ?, 'REQUESTED', ?, ?, ?, 'ADMIN', ?)`)
      .run(order.id, payment.id, amountCents, text(req.body?.reason, 'reason', { required: true, max: 500 }), oneOf(req.body?.stockAction || 'KEEP_STOCK', ['PENDING', 'RETURN_STOCK', 'KEEP_STOCK', 'CANCEL_SALE'], 'stockAction'), req.admin.id);
    res.status(201).json({ data: { id: Number(result.lastInsertRowid), status: 'REQUESTED' } });
  });

  router.get('/refunds', ordersOnly, (_req, res) => res.json({ data: getDatabase().prepare('SELECT * FROM refund_requests ORDER BY created_at DESC LIMIT 200').all() }));
  router.post('/refunds/:id/approve', adminOnly, async (req, res) => {
    const db = getDatabase();
    const refund = db.prepare('SELECT * FROM refund_requests WHERE id = ?').get(Number(req.params.id));
    if (!refund) throw new AppError('Reembolso no encontrado.', { status: 404, code: 'REFUND_NOT_FOUND' });
    if (refund.status !== 'REQUESTED' && refund.status !== 'REJECTED') return res.json({ data: refund });
    // La API de inventario expone la anulación de venta (que sí repone stock),
    // pero no tiene devoluciones. Un RETURN_STOCK se rechaza explícitamente en
    // vez de completarse en silencio y dejar el inventario descuadrado.
    if (refund.stock_action === 'RETURN_STOCK') {
      throw new AppError('La devolución de stock no se puede automatizar: la API de inventario sólo expone la anulación de venta. Cargá la devolución desde el panel de stock.', { status: 409, code: 'STOCK_RETURN_NOT_SUPPORTED' });
    }
    // Stock antes que dinero: si la reposición falla, el pedido queda en revisión
    // y el reembolso no se completa. Al revés se devolvería plata con el
    // inventario ya descontado.
    if (refund.stock_action === 'CANCEL_SALE') {
      const order = db.prepare('SELECT order_number FROM orders WHERE id = ?').get(refund.order_id);
      if (!order?.order_number) throw new AppError('El pedido del reembolso no existe.', { status: 404, code: 'ORDER_NOT_FOUND' });
      try {
        await catalogClient.cancelOrder(order.order_number, { externalOrderId: order.order_number, reason: `Reembolso ${refund.id}`, idempotencyKey: `refund-sale-${refund.id}` });
      } catch (error) {
        db.prepare("UPDATE orders SET stock_status = 'REVIEW', updated_at = ? WHERE id = ?").run(new Date().toISOString(), refund.order_id);
        throw new AppError('No se pudo reponer el stock en el sistema de inventario. El pedido quedó en revisión y el reembolso no se completó.', { status: 503, code: 'STOCK_CANCEL_REVIEW_REQUIRED', details: { orderId: refund.order_id, cause: error.code || 'STOCK_API_ERROR' } });
      }
    }
    const payment = db.prepare('SELECT * FROM payments WHERE id = ?').get(refund.payment_id);
    if (payment?.provider === 'mercadopago' && payment.external_id) {
      try {
        const result = await paymentProvider.refund(payment.external_id, refund.amount_cents);
        db.prepare("UPDATE refund_requests SET status = 'COMPLETED', provider_refund_id = ?, provider_payload_json = ?, updated_at = ? WHERE id = ?").run(result.id || null, JSON.stringify({ id: result.id, status: result.status }), new Date().toISOString(), refund.id);
        db.prepare("UPDATE payments SET status = 'REFUNDED', updated_at = ? WHERE id = ?").run(new Date().toISOString(), payment.id);
        db.prepare("UPDATE orders SET payment_status = 'REFUNDED', status = 'REFUNDED', updated_at = ? WHERE id = ?").run(new Date().toISOString(), refund.order_id);
      } catch (error) {
        db.prepare("UPDATE refund_requests SET status = 'REJECTED', provider_payload_json = ?, updated_at = ? WHERE id = ?").run(JSON.stringify({ error: error.code || 'PROVIDER_ERROR' }), new Date().toISOString(), refund.id);
        throw error;
      }
    } else {
      db.prepare("UPDATE refund_requests SET status = 'COMPLETED', updated_at = ? WHERE id = ?").run(new Date().toISOString(), refund.id);
    }
    res.json({ data: db.prepare('SELECT * FROM refund_requests WHERE id = ?').get(refund.id) });
  });

  // Los ajustes contienen CBU, alias y CUIT: no salen del rol ADMIN.
  router.get('/settings', adminOnly, (_req, res) => res.json({ data: getStoreSettings() }));
  router.patch('/settings', adminOnly, (req, res) => res.json({ data: updateStoreSettings(req.body || {}) }));
  router.get('/merchandising', contentOnly, (_req, res) => res.json({ data: getDatabase().prepare('SELECT * FROM merchandising_products ORDER BY sort_order DESC, updated_at DESC').all() }));
  router.patch('/merchandising/:productId', contentOnly, (req, res) => {
    const productId = String(req.params.productId || '').trim();
    if (!productId) throw new AppError('Producto inválido.', { code: 'VALIDATION_ERROR' });
    getDatabase().prepare(`INSERT INTO merchandising_products (inventory_product_id, featured, trending, sort_order, updated_at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(inventory_product_id) DO UPDATE SET featured=excluded.featured, trending=excluded.trending, sort_order=excluded.sort_order, updated_at=excluded.updated_at`)
      .run(productId, req.body?.featured ? 1 : 0, req.body?.trending ? 1 : 0, integer(req.body?.sortOrder, 'sortOrder', { required: false, min: -1000, max: 1000 }) || 0, new Date().toISOString());
    res.json({ data: getDatabase().prepare('SELECT * FROM merchandising_products WHERE inventory_product_id = ?').get(productId) });
  });

  router.get('/content', contentOnly, (_req, res) => res.json({ data: getContentBlocks() }));
  router.put('/content', contentOnly, (req, res) => res.json({ data: upsertContentBlock(req.body || {}) }));
  router.get('/shipping-zones', contentOnly, (_req, res) => res.json({ data: getShippingZones() }));
  router.post('/shipping-zones', contentOnly, (req, res) => {
    const name = text(req.body?.name, 'name', { required: true, max: 120 });
    const city = text(req.body?.city, 'city', { required: true, max: 120 });
    const priceCents = integer(req.body?.priceCents, 'priceCents', { min: 0 });
    const min = integer(req.body?.estimatedDaysMin, 'estimatedDaysMin', { min: 1, max: 90 });
    const max = integer(req.body?.estimatedDaysMax, 'estimatedDaysMax', { min: min, max: 90 });
    const result = getDatabase().prepare(`INSERT INTO shipping_zones (name, city, province, postal_codes_json, price_cents, estimated_days_min, estimated_days_max, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(name, city, text(req.body?.province, 'province', { max: 120 }), JSON.stringify(req.body?.postalCodes || []), priceCents, min, max, req.body?.active === false ? 0 : 1);
    res.status(201).json({ data: getDatabase().prepare('SELECT * FROM shipping_zones WHERE id = ?').get(result.lastInsertRowid) });
  });
  router.patch('/shipping-zones/:id', contentOnly, (req, res) => {
    const current = getDatabase().prepare('SELECT * FROM shipping_zones WHERE id = ?').get(Number(req.params.id));
    if (!current) throw new AppError('Zona no encontrada.', { status: 404, code: 'NOT_FOUND' });
    getDatabase().prepare(`UPDATE shipping_zones SET name = ?, city = ?, province = ?, postal_codes_json = ?, price_cents = ?, estimated_days_min = ?, estimated_days_max = ?, active = ?, updated_at = ? WHERE id = ?`).run(
      text(req.body?.name ?? current.name, 'name', { required: true, max: 120 }), text(req.body?.city ?? current.city, 'city', { required: true, max: 120 }), text(req.body?.province ?? current.province, 'province', { max: 120 }), JSON.stringify(req.body?.postalCodes ?? JSON.parse(current.postal_codes_json || '[]')), integer(req.body?.priceCents ?? current.price_cents, 'priceCents', { min: 0 }), integer(req.body?.estimatedDaysMin ?? current.estimated_days_min, 'estimatedDaysMin', { min: 1, max: 90 }), integer(req.body?.estimatedDaysMax ?? current.estimated_days_max, 'estimatedDaysMax', { min: 1, max: 90 }), req.body?.active === false ? 0 : 1, new Date().toISOString(), current.id
    );
    res.json({ data: getDatabase().prepare('SELECT * FROM shipping_zones WHERE id = ?').get(current.id) });
  });

  router.get('/discounts', contentOnly, (_req, res) => res.json({ data: listAutomaticDiscounts() }));
  router.post('/discounts', contentOnly, (req, res) => res.status(201).json({ data: createAutomaticDiscount(req.body || {}) }));
  router.get('/coupons', contentOnly, (_req, res) => res.json({ data: listCoupons() }));
  router.post('/coupons', contentOnly, (req, res) => res.status(201).json({ data: createCoupon(req.body || {}) }));
  router.patch('/coupons/:id', contentOnly, (req, res) => res.json({ data: updateCoupon(Number(req.params.id), req.body || {}) }));
  router.get('/coupons/:id', contentOnly, (_req, res) => res.json({ data: getCoupon(Number(req.params.id)) }));

  router.get('/audit', adminOnly, (_req, res) => res.json({ data: getDatabase().prepare('SELECT id, actor_type, actor_id, action, entity_type, entity_id, created_at FROM audit_logs ORDER BY created_at DESC LIMIT 200').all() }));
  router.get('/errors', adminOnly, (_req, res) => res.json({ data: getDatabase().prepare('SELECT id, request_id AS requestId, level, code, message, method, path, created_at AS createdAt FROM error_logs ORDER BY created_at DESC LIMIT 200').all() }));
  router.get('/outbox', adminOnly, (_req, res) => res.json({ data: getDatabase().prepare('SELECT id, template, recipient, subject, status, attempts, last_error, created_at, sent_at FROM email_outbox ORDER BY created_at DESC LIMIT 200').all() }));
  return router;
}
