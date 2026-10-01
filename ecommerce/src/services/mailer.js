import nodemailer from 'nodemailer';
import { getDatabase, transaction } from '../db/database.js';
import { getPublicSettings } from './settings.js';

let transporter;

function getTransporter(config) {
  if (!config.smtp.host) return null;
  if (!transporter) transporter = nodemailer.createTransport({ host: config.smtp.host, port: config.smtp.port, secure: config.smtp.secure, auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.password } : undefined });
  return transporter;
}

export function enqueueOrderEmail(order, template, publicToken = '') {
  const settings = getPublicSettings();
  if (!order?.customer?.email) return;
  const orderNumber = order.number || order.order_number;
  const payload = { orderId: order.id, orderNumber, items: order.items, total: order.totals?.total ?? order.total_cents / 100 };
  if (publicToken) payload.orderUrl = `${settings ? '' : ''}${process.env.PUBLIC_BASE_URL || 'http://localhost:4000'}/pedido/${encodeURIComponent(orderNumber)}?token=${encodeURIComponent(publicToken)}`;
  const subjects = { ORDER_CREATED: `Recibimos tu pedido ${orderNumber}`, PAYMENT_APPROVED: `Pago aprobado — ${orderNumber}`, ORDER_CANCELLED: `Pedido ${orderNumber} cancelado` };
  getDatabase().prepare(`INSERT INTO email_outbox (template, recipient, subject, payload_json, dedupe_key) VALUES (?, ?, ?, ?, ?)`)
    .run(template, order.customer.email, subjects[template] || `NEXO Store — ${orderNumber}`, JSON.stringify(payload), `${template}:${order.id}`);
}

export function enqueuePasswordReset(emailValue, payload) {
  getDatabase().prepare(`INSERT INTO email_outbox (template, recipient, subject, payload_json, dedupe_key) VALUES (?, ?, ?, ?, ?)`)
    .run('PASSWORD_RESET', emailValue, 'Restablecer tu contraseña', JSON.stringify(payload), `PASSWORD_RESET:${Date.now()}`);
}

export async function processEmailOutbox(config, { limit = 20 } = {}) {
  const db = getDatabase();
  const rows = db.prepare("SELECT * FROM email_outbox WHERE status IN ('PENDING', 'FAILED') AND attempts < 5 ORDER BY id LIMIT ?").all(limit);
  const transport = getTransporter(config);
  let sent = 0;
  for (const row of rows) {
    if (!transport) {
      db.prepare("UPDATE email_outbox SET status = 'NOT_CONFIGURED', last_error = ? WHERE id = ?").run('SMTP no configurado', row.id);
      continue;
    }
    try {
      db.prepare("UPDATE email_outbox SET status = 'PROCESSING', attempts = attempts + 1 WHERE id = ?").run(row.id);
      const payload = JSON.parse(row.payload_json);
      await transport.sendMail({ from: config.smtp.from, to: row.recipient, subject: row.subject, text: renderEmail(row.template, payload) });
      db.prepare("UPDATE email_outbox SET status = 'SENT', sent_at = ?, last_error = NULL WHERE id = ?").run(new Date().toISOString(), row.id);
      sent += 1;
    } catch (error) {
      db.prepare("UPDATE email_outbox SET status = 'FAILED', last_error = ? WHERE id = ?").run(String(error.message).slice(0, 500), row.id);
    }
  }
  return { processed: rows.length, sent, configured: Boolean(transport) };
}

function renderEmail(template, payload) {
  if (template === 'PASSWORD_RESET') return `Restablecé tu contraseña usando este enlace: ${payload.resetUrl}`;
  const items = (payload.items || []).map((item) => `${item.name || item.product_name} × ${item.quantity}`).join('\n');
  return `NEXO Store\nPedido: ${payload.orderNumber}\n\n${items}\n\nTotal: USD ${Number(payload.total || 0).toFixed(2)}`;
}
