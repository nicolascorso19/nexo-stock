import express from 'express';
import { verifySignedRequest, sha256 } from '../lib/security.js';
import { verifyMercadoPagoWebhook } from '../services/payments.js';
import { getDatabase, transaction } from '../db/database.js';
import { AppError } from '../lib/errors.js';
import { reconcilePayment } from '../services/orders.js';
import { getPaymentProvider } from '../services/payments.js';

export function webhookRouter({ config, catalogClient, paymentProvider = getPaymentProvider(config) }) {
  const router = express.Router();

  router.post('/mercadopago', async (req, res) => {
    let payload;
    try {
      payload = verifyMercadoPagoWebhook({ headers: req.headers, rawBody: req.rawBody, secret: config.mercadoPago.webhookSecret });
    } catch (error) {
      res.status(error.status || 401).json({ error: { code: error.code || 'INVALID_PAYMENT_SIGNATURE', message: 'No se pudo validar la notificación.' } });
      return;
    }
    const notification = payload?.data || {};
    const eventId = String(req.get('x-request-id') || notification.id || sha256(req.rawBody || '')).slice(0, 180);
    const db = getDatabase();
    const existing = db.prepare('SELECT * FROM webhook_inbox WHERE provider = ? AND event_id = ?').get('mercadopago', eventId);
    if (existing) return res.status(200).json({ data: { accepted: true, duplicate: true } });
    try {
      transaction(() => db.prepare(`INSERT INTO webhook_inbox (provider, event_id, event_type, payload_json) VALUES (?, ?, ?, ?)`).run('mercadopago', eventId, payload.type || 'payment', JSON.stringify(payload)));
    } catch (error) {
      if (String(error.code).includes('CONSTRAINT')) return res.status(200).json({ data: { accepted: true, duplicate: true } });
      throw error;
    }
    res.status(202).json({ data: { accepted: true } });
    setImmediate(() => processMercadoPagoEvent({ eventId, notification, paymentProvider, catalogClient, config }).catch((error) => {
      db.prepare('UPDATE webhook_inbox SET error_message = ? WHERE provider = ? AND event_id = ?').run(String(error.message).slice(0, 500), 'mercadopago', eventId);
    }));
  });

  router.post('/stock/webhook', (req, res, next) => {
    try {
      if (!config.stockWebhooks.enabled) throw new AppError('Webhooks de stock deshabilitados.', { status: 404, code: 'WEBHOOK_DISABLED' });
      const pathname = new URL(req.originalUrl, config.publicBaseUrl).pathname;
      verifySignedRequest({ method: req.method, pathname, timestamp: req.get('X-ECOMMERCE-TIMESTAMP'), nonce: req.get('X-ECOMMERCE-NONCE'), body: req.rawBody, signature: req.get('X-ECOMMERCE-SIGNATURE'), keyId: req.get('X-ECOMMERCE-KEY-ID'), expectedKeyId: config.stockWebhooks.keyId, secret: config.stockWebhooks.secret });
      const eventId = String(req.get('X-ECOMMERCE-NONCE') || sha256(req.rawBody || ''));
      const db = getDatabase();
      const eventType = String(req.body?.type || 'catalog.updated');
      const inserted = db.prepare('INSERT OR IGNORE INTO webhook_inbox (provider, event_id, event_type, payload_json, processed_at) VALUES (?, ?, ?, ?, ?)').run('stock', eventId, eventType, req.rawBody || '{}', new Date().toISOString());
      if (inserted.changes) {
        db.prepare("UPDATE integration_state SET last_success_at = ?, last_attempt_at = ?, last_error_code = NULL, last_error_message = NULL, updated_at = ? WHERE provider = 'stock'").run(new Date().toISOString(), new Date().toISOString(), new Date().toISOString());
        catalogClient.invalidate();
      }
      res.status(202).json({ data: { accepted: true } });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

async function processMercadoPagoEvent({ eventId, notification, paymentProvider, catalogClient, config }) {
  const db = getDatabase();
  const externalId = String(notification.id || '');
  if (!externalId) return;
  const payment = db.prepare("SELECT * FROM payments WHERE provider = 'mercadopago' AND external_id = ?").get(externalId);
  if (!payment) {
    db.prepare('UPDATE webhook_inbox SET processed_at = ? WHERE provider = ? AND event_id = ?').run(new Date().toISOString(), 'mercadopago', eventId);
    return;
  }
  try {
    const remote = await paymentProvider.getPayment(externalId);
    await reconcilePayment({ orderId: payment.order_id, providerPayment: { ...remote, provider: 'mercadopago' }, paymentProvider, catalogClient, actor: 'PAYMENT_PROVIDER' });
    db.prepare('UPDATE webhook_inbox SET processed_at = ? WHERE provider = ? AND event_id = ?').run(new Date().toISOString(), 'mercadopago', eventId);
  } catch (error) {
    db.prepare('UPDATE webhook_inbox SET error_message = ? WHERE provider = ? AND event_id = ?').run(String(error.message).slice(0, 500), 'mercadopago', eventId);
    throw error;
  }
}
