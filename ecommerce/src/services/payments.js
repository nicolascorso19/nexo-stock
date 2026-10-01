import crypto from 'node:crypto';
import { getDatabase, transaction } from '../db/database.js';
import { AppError } from '../lib/errors.js';
import { getPublicSettings } from './settings.js';

export class MercadoPagoProvider {
  constructor(config, fetchImpl = globalThis.fetch) {
    this.config = config;
    this.fetch = fetchImpl;
  }

  enabled() {
    return Boolean(this.config.mercadoPago.enabled && this.config.mercadoPago.accessToken);
  }

  async request(method, path, body) {
    if (!this.enabled()) throw new AppError('Mercado Pago no está configurado.', { status: 503, code: 'PAYMENT_PROVIDER_NOT_CONFIGURED' });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await this.fetch(`https://api.mercadopago.com${path}`, {
        method,
        headers: { Authorization: `Bearer ${this.config.mercadoPago.accessToken}`, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new AppError('Mercado Pago rechazó la operación.', { status: 502, code: 'PAYMENT_PROVIDER_ERROR', details: { status: response.status, providerCode: data?.code || null } });
      return data;
    } finally {
      clearTimeout(timeout);
    }
  }

  async createPreference({ order, payment }) {
    const settings = getPublicSettings();
    const preference = await this.request('POST', '/checkout/preferences', {
      items: order.items.map((item) => ({
        id: String(item.inventory_variant_id),
        title: `${item.product_name} — ${item.variant_name}`,
        description: item.variant_name,
        quantity: item.quantity,
        currency_id: 'USD',
        unit_price: item.unit_price_cents / 100
      })),
      payer: { name: order.first_name, surname: order.last_name, email: order.email, phone: { number: order.phone.replace(/\D/g, '') } },
      external_reference: order.order_number,
      back_urls: {
        success: this.config.mercadoPago.successUrl,
        pending: this.config.mercadoPago.pendingUrl,
        failure: this.config.mercadoPago.failureUrl
      },
      auto_return: 'approved',
      notification_url: `${this.config.publicBaseUrl}/api/webhooks/mercadopago`,
      statement_descriptor: settings.brandName.slice(0, 22),
      metadata: { order_id: String(order.id), payment_id: String(payment.id) }
    });
    return { externalId: preference.id, checkoutUrl: preference.init_point || preference.sandbox_init_point };
  }

  async getPayment(externalId) {
    return this.request('GET', `/v1/payments/${encodeURIComponent(externalId)}`);
  }

  async refund(externalId, amountCents) {
    return this.request('POST', `/v1/payments/${encodeURIComponent(externalId)}/refunds`, { amount: amountCents / 100 });
  }
}

export function getPaymentProvider(config) {
  return new MercadoPagoProvider(config);
}

export async function createPayment({ order, method, provider, config }) {
  const db = getDatabase();
  const amountCents = order.totals?.total !== undefined ? Math.round(Number(order.totals.total) * 100) : Number(order.total_cents);
  const providerOrder = {
    ...order,
    order_number: order.order_number || order.number,
    total_cents: amountCents,
    items: (order.items || []).map((item) => ({ ...item, inventory_variant_id: item.inventory_variant_id ?? item.variantId, product_name: item.product_name ?? item.name, variant_name: item.variant_name ?? item.variant, unit_price_cents: item.unit_price_cents ?? Math.round(Number(item.unitPrice ?? item.price ?? 0) * 100) })),
    first_name: order.first_name || order.customer?.firstName || '',
    last_name: order.last_name || order.customer?.lastName || '',
    email: order.email || order.customer?.email || '',
    phone: order.phone || order.customer?.phone || ''
  };
  const normalizedMethod = String(method || '').toLowerCase();
  const settings = getPublicSettings();
  if (normalizedMethod === 'cash' && !settings.payments.cash) throw new AppError('El pago en efectivo no está habilitado.', { status: 400, code: 'PAYMENT_METHOD_DISABLED' });
  if (normalizedMethod === 'bank_transfer' && !settings.payments.transfer) throw new AppError('La transferencia no está habilitada.', { status: 400, code: 'PAYMENT_METHOD_DISABLED' });
  if (normalizedMethod === 'mercadopago' && !provider.enabled()) throw new AppError('El pago con Mercado Pago no está disponible.', { status: 503, code: 'PAYMENT_PROVIDER_NOT_CONFIGURED' });
  if (!['cash', 'bank_transfer', 'mercadopago'].includes(normalizedMethod)) throw new AppError('El medio de pago no es válido.', { code: 'VALIDATION_ERROR' });
  const existing = db.prepare('SELECT * FROM payments WHERE order_id = ? AND provider = ? ORDER BY id DESC LIMIT 1').get(order.id, normalizedMethod);
  if (existing && existing.status !== 'ERROR') return serializePayment(existing);
  const payment = {
    order_id: order.id,
    provider: normalizedMethod,
    method: normalizedMethod,
    status: normalizedMethod === 'mercadopago' ? 'PROCESSING' : 'PENDING',
    amount_cents: amountCents,
    idempotency_key: `order-${order.id}-${normalizedMethod}`,
    external_reference: providerOrder.order_number
  };
  let result;
  if (existing) {
    transaction(() => db.prepare('UPDATE payments SET status = ?, amount_cents = ?, external_reference = ?, failure_code = NULL, failure_message = NULL, updated_at = ? WHERE id = ?').run(payment.status, payment.amount_cents, payment.external_reference, new Date().toISOString(), existing.id));
    result = db.prepare('SELECT * FROM payments WHERE id = ?').get(existing.id);
  } else {
    const inserted = transaction(() => db.prepare(`INSERT INTO payments (order_id, provider, method, status, amount_cents, external_reference, idempotency_key) VALUES (@order_id, @provider, @method, @status, @amount_cents, @external_reference, @idempotency_key)`).run(payment));
    result = db.prepare('SELECT * FROM payments WHERE id = ?').get(inserted.lastInsertRowid);
  }
  if (normalizedMethod === 'mercadopago') {
    try {
      const preference = await provider.createPreference({ order: providerOrder, payment: result });
      db.prepare('UPDATE payments SET external_id = ?, checkout_url = ?, updated_at = ? WHERE id = ?').run(preference.externalId, preference.checkoutUrl, new Date().toISOString(), result.id);
      result = db.prepare('SELECT * FROM payments WHERE id = ?').get(result.id);
    } catch (error) {
      db.prepare("UPDATE payments SET status = 'ERROR', failure_code = ?, failure_message = ?, updated_at = ? WHERE id = ?").run(error.code || 'PAYMENT_PROVIDER_ERROR', error.message, new Date().toISOString(), result.id);
      throw error;
    }
  }
  return serializePayment(result);
}

export function serializePayment(row) {
  return {
    id: row.id,
    provider: row.provider,
    method: row.method,
    status: row.status,
    amount: row.amount_cents / 100,
    currency: row.currency,
    checkoutUrl: row.checkout_url,
    externalId: row.external_id,
    failureMessage: row.failure_message
  };
}

export function serializeOrderForProvider(order) {
  return { ...order, items: order.items || [] };
}

export function verifyMercadoPagoWebhook({ headers, rawBody, secret }) {
  if (!secret) throw new AppError('El secreto de Mercado Pago no está configurado.', { status: 503, code: 'PAYMENT_PROVIDER_NOT_CONFIGURED' });
  const signature = headers['x-signature'];
  const requestId = headers['x-request-id'];
  const timestamp = headers['ts'];
  const payload = JSON.parse(rawBody || '{}');
  const dataId = payload?.data?.id || headers['x-id'] || '';
  if (!signature || !requestId || !timestamp) throw new AppError('Firma de Mercado Pago ausente.', { status: 401, code: 'INVALID_PAYMENT_SIGNATURE' });
  if (Math.abs(Date.now() - Number(timestamp)) > 5 * 60 * 1000) throw new AppError('Firma de Mercado Pago expirada.', { status: 401, code: 'PAYMENT_SIGNATURE_EXPIRED' });
  const manifest = `id:${dataId};request-id:${requestId};ts:${timestamp};`;
  const expected = crypto.createHmac('sha256', secret).update(manifest).digest('hex');
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) throw new AppError('Firma de Mercado Pago inválida.', { status: 401, code: 'INVALID_PAYMENT_SIGNATURE' });
  return payload;
}

export function mapMercadoPagoStatus(status) {
  return ({ approved: 'APPROVED', authorized: 'PROCESSING', in_process: 'PROCESSING', pending_review: 'PROCESSING', rejected: 'REJECTED', cancelled: 'CANCELLED', charged_back: 'REFUNDED', refunded: 'REFUNDED' })[String(status || '').toLowerCase()] || 'PENDING';
}
