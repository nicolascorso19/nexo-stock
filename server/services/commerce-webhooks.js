import crypto from 'node:crypto';
import { createId, nowIso, sha256 } from '../utils.js';

export async function dispatchCommerceEvents(db, config, fetchImpl = globalThis.fetch) {
  if (!config.commerceWebhooksEnabled || !config.commerceWebhookUrl || !config.commerceWebhookKeyId || !config.commerceWebhookSecret) return { delivered: 0, skipped: true };
  if (config.isProduction && !config.commerceWebhookUrl.startsWith('https://')) return { delivered: 0, error: 'Webhook URL must use HTTPS in production' };
  const rows = db.prepare(`SELECT * FROM commerce_events WHERE delivered_at IS NULL AND (next_attempt_at IS NULL OR next_attempt_at <= ?) ORDER BY created_at LIMIT 25`).all(nowIso());
  let delivered = 0;
  for (const row of rows) {
    const event = JSON.parse(row.payload_json);
    const body = JSON.stringify({ eventId: row.id, type: row.event_type, occurredAt: row.created_at, data: event });
    const timestamp = String(Date.now());
    const nonce = crypto.randomBytes(12).toString('base64url');
    const pathname = new URL(config.commerceWebhookUrl).pathname;
    const signature = crypto.createHmac('sha256', config.commerceWebhookSecret).update(`POST\n${pathname}\n${timestamp}\n${nonce}\n${sha256(body)}`).digest('hex');
    try {
      const response = await fetchImpl(config.commerceWebhookUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-ECOMMERCE-KEY-ID': config.commerceWebhookKeyId, 'X-ECOMMERCE-TIMESTAMP': timestamp, 'X-ECOMMERCE-NONCE': nonce, 'X-ECOMMERCE-SIGNATURE': signature }, body, signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      db.prepare('UPDATE commerce_events SET delivered_at = ?, attempts = attempts + 1, last_error = NULL WHERE id = ?').run(nowIso(), row.id);
      delivered += 1;
    } catch (error) {
      const attempts = Number(row.attempts || 0) + 1;
      const delay = Math.min(3600, 30 * (2 ** Math.min(attempts, 7)));
      db.prepare('UPDATE commerce_events SET attempts = ?, next_attempt_at = ?, last_error = ? WHERE id = ?').run(attempts, new Date(Date.now() + delay * 1000).toISOString(), String(error.message).slice(0, 500), row.id);
    }
  }
  return { delivered, checked: rows.length };
}
