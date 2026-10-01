import crypto from 'node:crypto';
import { getDatabase, transaction } from '../db/database.js';
import { AppError } from '../lib/errors.js';
import { newOrderNumber } from '../lib/idempotency.js';
import { email, integer, normalizeDocument, oneOf, text } from '../lib/validation.js';
import { hashToken } from '../lib/security.js';
import { quoteCart, verifyQuoteToken } from './quote.js';
import { markCartConverted } from './cart.js';
import { createPayment, getPaymentProvider, mapMercadoPagoStatus, serializePayment } from './payments.js';
import { enqueueOrderEmail } from './mailer.js';
import { recordAnalytics } from './analytics.js';

const ACTIVE_ORDER_STATES = new Set(['PENDING_PAYMENT', 'PAYMENT_APPROVED', 'PREPARING', 'READY_FOR_PICKUP', 'SHIPPED']);

export async function createOrder({ cart, customer, input, config, catalogClient, paymentProvider = getPaymentProvider(config) }) {
  const db = getDatabase();
  const idempotencyKey = String(input.idempotencyKey || '').trim();
  if (!idempotencyKey) throw new AppError('Falta la clave de idempotencia.', { code: 'IDEMPOTENCY_KEY_REQUIRED' });
  const existing = db.prepare('SELECT * FROM orders WHERE idempotency_key = ?').get(idempotencyKey);
  if (existing) {
    const replayOrder = getOrder(existing.id);
    const replayPayment = getDatabase().prepare('SELECT * FROM payments WHERE order_id = ? ORDER BY id DESC LIMIT 1').get(existing.id);
    return { order: replayOrder, payment: replayPayment ? serializePayment(replayPayment) : null, publicToken: deriveGuestToken(existing.order_number, config), reservation: replayOrder.reservation };
  }

  const customerId = customer?.id || null;
  const firstName = text(input.firstName, 'firstName', { required: true, max: 80 });
  const lastName = text(input.lastName, 'lastName', { required: true, max: 80 });
  const emailValue = email(input.email);
  const phone = text(input.phone, 'phone', { required: true, max: 40 });
  const whatsapp = text(input.whatsapp, 'whatsapp', { max: 40 });
  const documentType = oneOf(input.documentType || 'DNI', ['DNI', 'CUIT', 'CUIL', 'PASSPORT', 'OTHER'], 'documentType');
  const documentNumber = normalizeDocument(input.documentNumber);
  if (!documentNumber) throw new AppError('El documento es obligatorio.', { code: 'VALIDATION_ERROR' });
  const fulfillmentMethod = oneOf(input.fulfillmentMethod, ['PICKUP', 'SHIPPING'], 'fulfillmentMethod');
  const address = normalizeAddress(input.address, fulfillmentMethod);
  const method = oneOf(input.paymentMethod, ['cash', 'bank_transfer', 'mercadopago'], 'paymentMethod');
  if (method === 'cash' && fulfillmentMethod !== 'PICKUP') throw new AppError('El pago en efectivo sólo está disponible para retiro en local.', { code: 'PAYMENT_METHOD_NOT_ALLOWED' });
  if (!input.quoteToken) throw new AppError('Primero confirmá la cotización del carrito.', { status: 409, code: 'QUOTE_REQUIRED' });
  const catalog = await catalogClient.getCatalog({ fresh: true });
  if (catalog._stale) throw new AppError('Estamos verificando la disponibilidad del producto. Intentá nuevamente en unos segundos.', { status: 503, code: 'STOCK_AVAILABILITY_UNKNOWN' });
  const quote = quoteCart({ cart, catalog, couponCode: input.couponCode, customerId, fulfillmentMethod, locality: address.locality, postalCode: address.postalCode, config });
  const oldQuote = verifyQuoteToken(input.quoteToken, config);
  const priceChanged = oldQuote.totalCents !== quote.totalCents || JSON.stringify(oldQuote.lines) !== JSON.stringify(quote.lines.map((line) => [line.inventoryVariantId, line.quantity, line.unitPrice, line.subtotalCents, line.discountCents]));
  if (priceChanged && input.acceptPriceChanges !== true) {
    throw new AppError('El precio o la disponibilidad cambiaron. Revisá la nueva cotización antes de continuar.', { status: 409, code: 'PRICE_CHANGED', details: { quote } });
  }

  if (quote.coupon?.id) {
    const coupon = getDatabase().prepare('SELECT * FROM coupons WHERE id = ?').get(quote.coupon.id);
    if (coupon?.max_uses_per_customer !== null && coupon?.max_uses_per_customer !== undefined) {
      const used = customerId
        ? getDatabase().prepare('SELECT COUNT(*) AS count FROM coupon_redemptions WHERE coupon_id = ? AND customer_id = ?').get(coupon.id, customerId).count
        : getDatabase().prepare('SELECT COUNT(*) AS count FROM coupon_redemptions cr JOIN orders o ON o.id = cr.order_id WHERE cr.coupon_id = ? AND o.email = ?').get(coupon.id, emailValue).count;
      if (used >= coupon.max_uses_per_customer) throw new AppError('El cupón alcanzó su límite de usos para este cliente.', { status: 409, code: 'COUPON_EXHAUSTED' });
    }
  }

  const orderNumber = newOrderNumber();
  const publicToken = deriveGuestToken(orderNumber, config);
  const reservationExpiresAt = new Date(Date.now() + config.reservationMinutes * 60 * 1000).toISOString();
  const orderId = transaction(() => {
    const orderRow = {
      order_number: orderNumber,
      public_token_hash: hashToken(publicToken),
      customer_id: customerId,
      first_name: firstName,
      last_name: lastName,
      document_type: documentType,
      document_number: documentNumber,
      email: emailValue,
      phone,
      whatsapp,
      fulfillment_method: fulfillmentMethod,
      shipping_address_json: JSON.stringify(address),
      shipping_zone_id: quote.shipping.zoneId || null,
      shipping_method: input.shippingMethod || '',
      estimated_delivery: quote.shipping.estimatedDays || '',
      currency: 'USD',
      subtotal_cents: quote.subtotalCents,
      automatic_discount_cents: quote.automaticDiscountCents,
      coupon_discount_cents: quote.couponDiscountCents,
      discount_cents: quote.discountCents,
      shipping_cents: quote.shippingCents,
      tax_cents: quote.taxCents,
      total_cents: quote.totalCents,
      coupon_id: quote.coupon?.id || null,
      coupon_code: quote.coupon?.code || null,
      customer_note: text(input.customerNote, 'customerNote', { max: 1000 }),
      quote_token_hash: hashToken(input.quoteToken),
      idempotency_key: idempotencyKey,
      reservation_expires_at: reservationExpiresAt
    };
    const orderResult = db.prepare(`
      INSERT INTO orders (order_number, public_token_hash, customer_id, first_name, last_name, document_type, document_number, email, phone, whatsapp,
        fulfillment_method, shipping_address_json, shipping_zone_id, shipping_method, estimated_delivery, currency, subtotal_cents,
        automatic_discount_cents, coupon_discount_cents, discount_cents, shipping_cents, tax_cents, total_cents, coupon_id, coupon_code,
        customer_note, quote_token_hash, idempotency_key, reservation_expires_at)
      VALUES (@order_number, @public_token_hash, @customer_id, @first_name, @last_name, @document_type, @document_number, @email, @phone, @whatsapp,
        @fulfillment_method, @shipping_address_json, @shipping_zone_id, @shipping_method, @estimated_delivery, @currency, @subtotal_cents,
        @automatic_discount_cents, @coupon_discount_cents, @discount_cents, @shipping_cents, @tax_cents, @total_cents, @coupon_id, @coupon_code,
        @customer_note, @quote_token_hash, @idempotency_key, @reservation_expires_at)
    `).run(orderRow);
    const id = Number(orderResult.lastInsertRowid);
    const insertItem = db.prepare(`
      INSERT INTO order_items (order_id, inventory_product_id, inventory_variant_id, product_name, variant_name, sku, brand, model, capacity, color, condition, image_url, unit_price_cents, quantity, automatic_discount_cents, coupon_discount_cents, discount_cents, line_total_cents)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const line of quote.lines) {
      insertItem.run(id, line.inventoryProductId, line.inventoryVariantId, line.product.name, `${line.variant.capacity || ''}${line.variant.capacity && line.variant.color ? ' / ' : ''}${line.variant.color || ''}` || 'Estándar', line.variant.sku || '', line.product.brand || '', line.product.name || '', line.variant.capacity || '', line.variant.color || '', line.variant.condition || 'NEW', line.variant.images?.[0] || line.product.images?.[0] || '', line.unitPrice, line.quantity, line.automaticDiscountCents, line.couponDiscountCents, line.discountCents, line.lineTotalCents);
    }
    if (quote.coupon?.id) {
      db.prepare('INSERT INTO coupon_redemptions (coupon_id, order_id, customer_id, discount_cents) VALUES (?, ?, ?, ?)').run(quote.coupon.id, id, customerId, quote.couponDiscountCents);
    }
    db.prepare('INSERT INTO order_status_history (order_id, from_status, to_status, actor_type, actor_id) VALUES (?, NULL, ?, ?, ?)').run(id, 'PENDING_PAYMENT', customer ? 'CUSTOMER' : 'CUSTOMER', customer?.id || null);
    return id;
  });

  let order = getOrder(orderId, { includePrivate: true });
  try {
    const reservation = await catalogClient.reserve({
      externalOrderId: orderNumber,
      idempotencyKey: `reserve-${orderNumber}`,
      expiresAt: reservationExpiresAt,
      items: quote.lines.map((line) => ({ variantId: line.inventoryVariantId, quantity: line.quantity }))
    });
    transaction(() => {
      db.prepare(`INSERT INTO stock_reservation_refs (order_id, external_reservation_id, state, requested_payload_json, expires_at)
        VALUES (?, ?, 'RESERVED', ?, ?)`).run(orderId, reservation.reservationId, JSON.stringify({ externalOrderId: orderNumber, items: quote.lines.map((line) => ({ variantId: line.inventoryVariantId, quantity: line.quantity })) }), reservation.expiresAt || reservationExpiresAt);
      db.prepare("UPDATE orders SET stock_status = 'RESERVED', updated_at = ? WHERE id = ?").run(new Date().toISOString(), orderId);
    });
  } catch (error) {
    transaction(() => {
      db.prepare("UPDATE orders SET status = 'CANCELLED', stock_status = 'RELEASED', cancellation_reason = ?, updated_at = ? WHERE id = ?").run(`No se pudo reservar el stock: ${error.message}`, new Date().toISOString(), orderId);
      db.prepare('INSERT INTO order_status_history (order_id, from_status, to_status, note, actor_type) VALUES (?, ?, ?, ?, ?)').run(orderId, 'PENDING_PAYMENT', 'CANCELLED', 'Reserva de stock no creada', 'SYSTEM');
    });
    throw new AppError('No se pudo completar la compra porque la disponibilidad cambió. No se descontó stock.', { status: error.status || 409, code: error.code || 'STOCK_RESERVATION_FAILED', details: { orderId, orderNumber } });
  }

  order = getOrder(orderId, { includePrivate: true });
  markCartConverted(cart, orderId);
  let payment;
  try {
    payment = await createPayment({ order, method, provider: paymentProvider, config });
  } catch (error) {
    // La reserva se conserva para que el cliente pueda reintentar el pago; expirará de forma segura.
    order = getOrder(orderId, { includePrivate: true });
    throw new AppError('La orden se creó, pero el pago no pudo iniciarse. Podés reintentar desde el detalle del pedido.', { status: 503, code: error.code || 'PAYMENT_INITIALIZATION_FAILED', details: { order: publicOrder(order), reservation: publicReservation(order) } });
  }
  transaction(() => {
    db.prepare("UPDATE orders SET status = 'PENDING_PAYMENT', updated_at = ? WHERE id = ?").run(new Date().toISOString(), orderId);
  });
  enqueueOrderEmail(order, 'ORDER_CREATED', publicToken);
  recordAnalytics('ORDER_COMPLETED', { orderId, customerId, value: quote.totalCents / 100 });
  return { order: publicOrder(getOrder(orderId)), payment, publicToken, reservation: publicReservation(getOrder(orderId)) };
}

export function getOrder(id, { includePrivate = false } = {}) {
  const order = getDatabase().prepare('SELECT * FROM orders WHERE id = ?').get(id);
  if (!order) throw new AppError('Pedido no encontrado.', { status: 404, code: 'ORDER_NOT_FOUND' });
  const items = getDatabase().prepare('SELECT * FROM order_items WHERE order_id = ? ORDER BY id').all(id);
  const payments = getDatabase().prepare('SELECT * FROM payments WHERE order_id = ? ORDER BY id').all(id).map((row) => ({ id: row.id, provider: row.provider, method: row.method, status: row.status, amount: row.amount_cents / 100, currency: row.currency, checkoutUrl: row.checkout_url, failureMessage: row.failure_message, createdAt: row.created_at }));
  const reservation = getDatabase().prepare('SELECT * FROM stock_reservation_refs WHERE order_id = ?').get(id);
  const result = {
    id: order.id,
    number: order.order_number,
    status: order.status,
    paymentStatus: order.payment_status,
    stockStatus: order.stock_status,
    currency: order.currency,
    customer: { firstName: order.first_name, lastName: order.last_name, email: order.email, phone: order.phone, whatsapp: order.whatsapp },
    fulfillmentMethod: order.fulfillment_method,
    address: safeJson(order.shipping_address_json),
    totals: { subtotal: order.subtotal_cents / 100, discount: order.discount_cents / 100, shipping: order.shipping_cents / 100, tax: order.tax_cents / 100, total: order.total_cents / 100 },
    items: items.map((item) => ({ productId: item.inventory_product_id, variantId: item.inventory_variant_id, name: item.product_name, variant: item.variant_name, sku: item.sku, image: item.image_url, unitPrice: item.unit_price_cents / 100, quantity: item.quantity, discount: item.discount_cents / 100, lineTotal: item.line_total_cents / 100, condition: item.condition })),
    payments,
    reservation: reservation ? { id: reservation.external_reservation_id, state: reservation.state, expiresAt: reservation.expires_at } : null,
    createdAt: order.created_at,
    updatedAt: order.updated_at
  };
  if (includePrivate) return { ...result, _row: order, _reservation: reservation };
  return result;
}

export function publicOrder(order) {
  const { _row, _reservation, ...safe } = order;
  return safe;
}

function publicReservation(order) {
  return order.reservation ? { state: order.reservation.state, expiresAt: order.reservation.expiresAt } : null;
}

export function getOrderForCustomer(customerId, orderId) {
  const row = getDatabase().prepare('SELECT id FROM orders WHERE id = ? AND customer_id = ?').get(orderId, customerId);
  if (!row) throw new AppError('Pedido no encontrado.', { status: 404, code: 'ORDER_NOT_FOUND' });
  return getOrder(orderId);
}

export function getOrderForGuest(orderNumber, publicToken) {
  const row = getDatabase().prepare('SELECT * FROM orders WHERE order_number = ? AND public_token_hash = ?').get(String(orderNumber || '').trim().toUpperCase(), hashToken(publicToken || ''));
  if (!row) throw new AppError('Pedido no encontrado o enlace inválido.', { status: 404, code: 'ORDER_NOT_FOUND' });
  return getOrder(row.id);
}

export function listCustomerOrders(customerId) {
  return getDatabase().prepare('SELECT id FROM orders WHERE customer_id = ? ORDER BY created_at DESC').all(customerId).map((row) => getOrder(row.id));
}

export async function reconcilePayment({ orderId, providerPayment, paymentProvider, catalogClient, actor = 'SYSTEM' }) {
  const db = getDatabase();
  const order = getOrder(orderId, { includePrivate: true });
  const payment = db.prepare('SELECT * FROM payments WHERE order_id = ? AND provider = ? ORDER BY id DESC LIMIT 1').get(orderId, providerPayment.provider || 'mercadopago');
  if (!payment) throw new AppError('No se encontró el pago del pedido.', { status: 404, code: 'PAYMENT_NOT_FOUND' });
  const mapped = mapMercadoPagoStatus(providerPayment.status);
  const amountCents = Math.round(Number(providerPayment.transaction_amount || providerPayment.amount || 0) * 100);
  if (providerPayment.currency_id && providerPayment.currency_id !== 'USD') throw new AppError('El pago fue realizado en una moneda no soportada.', { status: 409, code: 'PAYMENT_CURRENCY_MISMATCH' });
  if (amountCents && amountCents !== payment.amount_cents) throw new AppError('El importe del pago no coincide con el pedido.', { status: 409, code: 'PAYMENT_AMOUNT_MISMATCH' });
  if (mapped === 'APPROVED') return confirmPaidOrder({ orderId, paymentId: payment.id, catalogClient, actor });
  if (['REJECTED', 'CANCELLED', 'REFUNDED'].includes(mapped)) return releaseUnpaidOrder({ orderId, paymentId: payment.id, catalogClient, actor, paymentStatus: mapped });
  transaction(() => {
    db.prepare('UPDATE payments SET status = ?, failure_code = ?, failure_message = ?, updated_at = ? WHERE id = ?').run(mapped === 'PENDING' ? 'PROCESSING' : mapped, providerPayment.status_detail || null, providerPayment.status_detail || null, new Date().toISOString(), payment.id);
    db.prepare('UPDATE orders SET payment_status = ?, updated_at = ? WHERE id = ?').run(mapped === 'PENDING' ? 'PROCESSING' : mapped, new Date().toISOString(), orderId);
  });
  return getOrder(orderId);
}

export async function confirmPaidOrder({ orderId, paymentId, catalogClient, actor = 'PAYMENT_PROVIDER' }) {
  const db = getDatabase();
  const order = getOrder(orderId, { includePrivate: true });
  if (!order.reservation) throw new AppError('El pedido no tiene una reserva de stock.', { status: 409, code: 'RESERVATION_NOT_FOUND' });
  if (order.stockStatus === 'CONFIRMED') {
    transaction(() => db.prepare("UPDATE payments SET status = 'APPROVED', paid_at = COALESCE(paid_at, ?), updated_at = ? WHERE id = ?").run(new Date().toISOString(), new Date().toISOString(), paymentId));
    return order;
  }
  transaction(() => {
    db.prepare("UPDATE payments SET status = 'APPROVED', paid_at = COALESCE(paid_at, ?), updated_at = ? WHERE id = ?").run(new Date().toISOString(), new Date().toISOString(), paymentId);
    db.prepare("UPDATE orders SET payment_status = 'APPROVED', stock_status = 'CONFIRMING', updated_at = ? WHERE id = ?").run(new Date().toISOString(), orderId);
  });
  try {
    await catalogClient.confirmReservation(order.reservation.id, { externalOrderId: order.number, idempotencyKey: `confirm-${order.number}` });
    transaction(() => {
      db.prepare("UPDATE stock_reservation_refs SET state = 'CONFIRMED', confirmed_at = ?, updated_at = ? WHERE order_id = ?").run(new Date().toISOString(), new Date().toISOString(), orderId);
      db.prepare("UPDATE orders SET status = 'PAYMENT_APPROVED', stock_status = 'CONFIRMED', confirmed_at = ?, updated_at = ? WHERE id = ?").run(new Date().toISOString(), new Date().toISOString(), orderId);
      db.prepare('INSERT INTO order_status_history (order_id, from_status, to_status, note, actor_type) VALUES (?, ?, ?, ?, ?)').run(orderId, 'PENDING_PAYMENT', 'PAYMENT_APPROVED', 'Pago aprobado y stock confirmado', actor);
    });
    enqueueOrderEmail(getOrder(orderId, { includePrivate: true }), 'PAYMENT_APPROVED');
    return getOrder(orderId);
  } catch (error) {
    transaction(() => {
      db.prepare("UPDATE stock_reservation_refs SET state = 'FAILED', last_error_code = ?, last_error_message = ?, updated_at = ? WHERE order_id = ?").run(error.code || 'STOCK_CONFIRM_FAILED', error.message, new Date().toISOString(), orderId);
      db.prepare("UPDATE orders SET status = 'FULFILLMENT_REVIEW', stock_status = 'REVIEW', updated_at = ? WHERE id = ?").run(new Date().toISOString(), orderId);
    });
    throw new AppError('El pago fue aprobado, pero la confirmación de inventario requiere revisión del administrador. No se modificará el stock automáticamente.', { status: 503, code: 'FULFILLMENT_REVIEW_REQUIRED', details: { orderId } });
  }
}

export async function releaseUnpaidOrder({ orderId, paymentId, catalogClient, actor = 'SYSTEM', paymentStatus = 'REJECTED' }) {
  const db = getDatabase();
  const order = getOrder(orderId, { includePrivate: true });
  if (order.stockStatus === 'RELEASED' || order.status === 'CANCELLED' || order.status === 'EXPIRED') return order;
  if (order._reservation && ['RESERVED', 'CONFIRMING'].includes(order._reservation.state)) {
    await catalogClient.releaseReservation(order._reservation.external_reservation_id, { externalOrderId: order.number, idempotencyKey: `release-${order.number}` });
    transaction(() => db.prepare("UPDATE stock_reservation_refs SET state = 'RELEASED', released_at = ?, updated_at = ? WHERE order_id = ?").run(new Date().toISOString(), new Date().toISOString(), orderId));
  }
  transaction(() => {
    db.prepare('UPDATE payments SET status = ?, updated_at = ? WHERE id = ?').run(paymentStatus, new Date().toISOString(), paymentId);
    db.prepare("UPDATE orders SET status = 'CANCELLED', payment_status = ?, stock_status = 'RELEASED', cancelled_at = ?, updated_at = ? WHERE id = ?").run(paymentStatus, new Date().toISOString(), new Date().toISOString(), orderId);
    db.prepare('INSERT INTO order_status_history (order_id, from_status, to_status, note, actor_type) VALUES (?, ?, ?, ?, ?)').run(orderId, 'PENDING_PAYMENT', 'CANCELLED', 'Pago no aprobado; reserva liberada', actor);
  });
  return getOrder(orderId);
}

export async function cancelOrder({ orderId, customerId = null, reason, catalogClient, provider, actor = 'CUSTOMER' }) {
  const db = getDatabase();
  const order = getOrder(orderId, { includePrivate: true });
  if (order.customer_id && customerId && order.customer_id !== customerId) throw new AppError('No tenés permiso para cancelar este pedido.', { status: 403, code: 'FORBIDDEN' });
  if (['CANCELLED', 'EXPIRED', 'DELIVERED'].includes(order.status)) return order;
  if (order._reservation) {
    try {
      if (['RESERVED', 'CONFIRMING', 'FAILED'].includes(order._reservation.state)) await catalogClient.releaseReservation(order._reservation.external_reservation_id, { externalOrderId: order.number, idempotencyKey: `cancel-${order.number}` });
      else if (order._reservation.state === 'CONFIRMED') await catalogClient.cancelOrder(order.number, { externalOrderId: order.number, reason, idempotencyKey: `cancel-sale-${order.number}` });
    } catch (error) {
      db.prepare("UPDATE orders SET stock_status = 'REVIEW', updated_at = ? WHERE id = ?").run(new Date().toISOString(), orderId);
      throw new AppError('No se pudo confirmar la devolución del stock. El pedido quedó en revisión para evitar una cancelación incorrecta.', { status: 503, code: 'STOCK_RELEASE_REVIEW_REQUIRED', details: { orderId } });
    }
  }
  transaction(() => {
    db.prepare("UPDATE orders SET status = 'CANCELLED', stock_status = 'RELEASED', cancelled_at = ?, cancellation_reason = ?, updated_at = ? WHERE id = ?").run(new Date().toISOString(), text(reason, 'reason', { required: true, max: 500 }), new Date().toISOString(), orderId);
    if (order.paymentStatus === 'PENDING' || order.paymentStatus === 'PROCESSING' || order.paymentStatus === 'REJECTED') db.prepare("UPDATE orders SET payment_status = 'CANCELLED' WHERE id = ?").run(orderId);
    db.prepare('INSERT INTO order_status_history (order_id, from_status, to_status, note, actor_type, actor_id) VALUES (?, ?, ?, ?, ?, ?)').run(orderId, order.status, 'CANCELLED', reason, actor, customerId);
    if (order.paymentStatus === 'APPROVED') db.prepare(`INSERT INTO refund_requests (order_id, payment_id, status, amount_cents, reason, stock_action, requested_by_type, requested_by_id) VALUES (?, ?, 'REQUESTED', ?, ?, 'KEEP_STOCK', ?, ?)`).run(orderId, order.payments[0]?.id || null, order.totals.total * 100, reason, actor === 'ADMIN' ? 'ADMIN' : 'CUSTOMER', customerId);
  });
  return getOrder(orderId);
}

export async function releaseExpiredOrders({ catalogClient }) {
  const db = getDatabase();
  const rows = db.prepare(`SELECT o.*, r.external_reservation_id, r.state FROM orders o JOIN stock_reservation_refs r ON r.order_id = o.id
    WHERE o.status = 'PENDING_PAYMENT' AND o.payment_status IN ('PENDING', 'PROCESSING', 'REJECTED', 'ERROR') AND r.state = 'RESERVED' AND r.expires_at <= ?`).all(new Date().toISOString());
  let released = 0;
  for (const row of rows) {
    try {
      await catalogClient.releaseReservation(row.external_reservation_id, { externalOrderId: row.order_number, idempotencyKey: `expire-${row.order_number}` });
      transaction(() => {
        db.prepare("UPDATE stock_reservation_refs SET state = 'EXPIRED', released_at = ?, updated_at = ? WHERE order_id = ?").run(new Date().toISOString(), new Date().toISOString(), row.id);
        db.prepare("UPDATE orders SET status = 'EXPIRED', stock_status = 'RELEASED', cancelled_at = ?, updated_at = ? WHERE id = ?").run(new Date().toISOString(), new Date().toISOString(), row.id);
        db.prepare('INSERT INTO order_status_history (order_id, from_status, to_status, note, actor_type) VALUES (?, ?, ?, ?, ?)').run(row.id, 'PENDING_PAYMENT', 'EXPIRED', 'La reserva de stock expiró', 'SYSTEM');
      });
      released += 1;
    } catch (error) {
      db.prepare('UPDATE stock_reservation_refs SET last_error_code = ?, last_error_message = ?, updated_at = ? WHERE order_id = ?').run(error.code || 'STOCK_RELEASE_FAILED', error.message, new Date().toISOString(), row.id);
    }
  }
  return { checked: rows.length, released };
}

/** Estados que sólo tienen sentido si el pago fue cobrado. */
const PAID_STATUSES = new Set(['PAYMENT_APPROVED', 'PREPARING', 'READY_FOR_PICKUP', 'SHIPPED', 'DELIVERED']);
/** Estados que sólo tienen sentido si el stock ya se descontó de verdad. */
const FULFILLED_STATUSES = new Set(['PREPARING', 'READY_FOR_PICKUP', 'SHIPPED', 'DELIVERED']);

export function updateOrderStatus(orderId, status, note = '', actor = { type: 'ADMIN', id: null }) {
  const allowed = {
    PENDING_PAYMENT: ['PAYMENT_APPROVED', 'CANCELLED', 'EXPIRED'],
    PAYMENT_APPROVED: ['PREPARING', 'CANCELLED'],
    PREPARING: ['READY_FOR_PICKUP', 'SHIPPED', 'CANCELLED'],
    READY_FOR_PICKUP: ['DELIVERED', 'CANCELLED'],
    SHIPPED: ['DELIVERED', 'CANCELLED'],
    // La confirmación de stock falló: la única salida administrativa es cancelar.
    // Reintentar la confirmación de stock es POST /orders/:id/payment/confirm.
    FULFILLMENT_REVIEW: ['CANCELLED']
  };
  const order = getOrder(orderId, { includePrivate: true });
  if (!allowed[order.status]?.includes(status)) throw new AppError('La transición de estado no está permitida.', { status: 409, code: 'INVALID_ORDER_TRANSITION' });
  // Un estado de entrega implica dinero cobrado y stock descontado. Sin estas
  // dos comprobaciones el panel podía llevar un pedido a DELIVERED sin que nadie
  // pagara y sin una sola unidad descontada del inventario.
  if (PAID_STATUSES.has(status) && !['APPROVED', 'REFUNDED'].includes(order.paymentStatus)) {
    throw new AppError('El pago de este pedido no está aprobado. Confirmá el pago antes de avanzar el estado.', { status: 409, code: 'PAYMENT_NOT_APPROVED' });
  }
  if (FULFILLED_STATUSES.has(status) && order.stockStatus !== 'CONFIRMED') {
    throw new AppError('El stock de este pedido no está confirmado en el sistema de inventario.', { status: 409, code: 'STOCK_NOT_CONFIRMED' });
  }
  const db = getDatabase();
  transaction(() => {
    db.prepare('UPDATE orders SET status = ?, updated_at = ?, delivered_at = CASE WHEN ? = \'DELIVERED\' THEN ? ELSE delivered_at END WHERE id = ?').run(status, new Date().toISOString(), status, new Date().toISOString(), orderId);
    db.prepare('INSERT INTO order_status_history (order_id, from_status, to_status, note, actor_type, actor_id) VALUES (?, ?, ?, ?, ?, ?)').run(orderId, order.status, status, note, actor.type, actor.id);
  });
  return getOrder(orderId);
}

export async function reconcileProviderPayment({ payment, provider }) {
  const remote = await provider.getPayment(payment.external_id);
  return { providerPayment: remote, orderId: payment.order_id, provider };
}

function deriveGuestToken(orderNumber, config) {
  const signature = cryptoHmac(config.stockApi.secret || 'guest-order', orderNumber);
  return `${orderNumber}.${signature}`;
}

function cryptoHmac(secret, value) {
  return crypto.createHmac('sha256', secret).update(String(value)).digest('base64url');
}

function normalizeAddress(input, method) {
  if (method === 'PICKUP') return { locality: '', postalCode: '' };
  const address = input || {};
  return {
    street: text(address.street, 'street', { required: true, max: 160 }),
    number: text(address.number, 'number', { required: true, max: 20 }),
    floor: text(address.floor, 'floor', { max: 20 }),
    apartment: text(address.apartment, 'apartment', { max: 20 }),
    locality: text(address.locality, 'locality', { required: true, max: 100 }),
    province: text(address.province, 'province', { required: true, max: 100 }),
    postalCode: text(address.postalCode, 'postalCode', { required: true, max: 20 }),
    notes: text(address.notes, 'notes', { max: 500 })
  };
}

function safeJson(value) {
  try { return JSON.parse(value || '{}'); } catch { return {}; }
}
