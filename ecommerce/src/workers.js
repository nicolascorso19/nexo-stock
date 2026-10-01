import { getDatabase } from './db/database.js';
import { CatalogClient } from './services/catalog-client.js';
import { getPaymentProvider } from './services/payments.js';
import { processEmailOutbox } from './services/mailer.js';
import { releaseExpiredOrders, reconcilePayment } from './services/orders.js';

async function notifyBackInStock(catalogClient, config) {
  const catalog = await catalogClient.getCatalog({ fresh: true });
  if (catalog._stale) return { checked: 0 };
  const variants = new Map(catalog.products.flatMap((product) => product.variants.map((variant) => [String(variant.id), variant])));
  const rows = getDatabase().prepare("SELECT * FROM back_in_stock_notifications WHERE status = 'PENDING'").all();
  for (const row of rows) {
    const variant = variants.get(String(row.inventory_variant_id));
    if (!variant || variant.availability === 'OUT') continue;
    getDatabase().prepare('INSERT OR IGNORE INTO email_outbox (template, recipient, subject, payload_json, dedupe_key) VALUES (?, ?, ?, ?, ?)').run('BACK_IN_STOCK', row.email, 'Tu producto volvió a estar disponible', JSON.stringify({ variantId: row.inventory_variant_id, productUrl: `${config.publicBaseUrl}/catalogo` }), `BACK_IN_STOCK:${row.id}`);
    getDatabase().prepare("UPDATE back_in_stock_notifications SET status = 'NOTIFIED', notified_at = ? WHERE id = ?").run(new Date().toISOString(), row.id);
  }
  return { checked: rows.length };
}

async function reconcilePendingPayments(config, paymentProvider, catalogClient) {
  if (!paymentProvider.enabled()) return { checked: 0 };
  const db = getDatabase();
  const rows = db.prepare("SELECT * FROM payments WHERE provider = 'mercadopago' AND external_id IS NOT NULL AND status IN ('PENDING','PROCESSING','ERROR') ORDER BY created_at LIMIT 20").all();
  for (const payment of rows) {
    try {
      const remote = await paymentProvider.getPayment(payment.external_id);
      await reconcilePayment({ orderId: payment.order_id, providerPayment: { ...remote, provider: 'mercadopago' }, paymentProvider, catalogClient, actor: 'SYSTEM' });
    } catch (error) {
      db.prepare('UPDATE payments SET updated_at = ? WHERE id = ?').run(new Date().toISOString(), payment.id);
    }
  }
  return { checked: rows.length };
}

export function startWorkers(config) {
  const catalogClient = new CatalogClient(config);
  const paymentProvider = getPaymentProvider(config);
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await releaseExpiredOrders({ catalogClient });
      await reconcilePendingPayments(config, paymentProvider, catalogClient);
      await notifyBackInStock(catalogClient, config);
      await processEmailOutbox(config, { limit: 10 });
    } catch (error) {
      console.error(JSON.stringify({ level: 'error', worker: 'commerce', code: error.code, message: error.message }));
    } finally {
      running = false;
    }
  };
  const interval = setInterval(tick, 15000);
  interval.unref();
  tick();
  return { interval, tick };
}

export function stopWorkers(workers) {
  if (workers?.interval) clearInterval(workers.interval);
}
