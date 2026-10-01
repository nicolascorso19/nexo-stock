import { getDatabase } from '../db/database.js';

export function recordAnalytics(eventName, { anonymousId = null, customerId = null, sessionId = null, productId = null, variantId = null, orderId = null, metadata = {}, value = null } = {}) {
  const payload = { ...metadata };
  if (value !== null) payload.value = Number(value);
  getDatabase().prepare(`INSERT INTO analytics_events (event_name, anonymous_id, customer_id, session_id, inventory_product_id, inventory_variant_id, order_id, metadata_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(String(eventName), anonymousId, customerId, sessionId, productId, variantId, orderId, JSON.stringify(payload));
}

export function analyticsSummary() {
  const db = getDatabase();
  const events = db.prepare('SELECT event_name, COUNT(*) AS count FROM analytics_events GROUP BY event_name').all();
  const topProducts = db.prepare(`SELECT inventory_product_id AS productId, COUNT(*) AS views FROM analytics_events WHERE event_name = 'PRODUCT_VIEW' GROUP BY inventory_product_id ORDER BY views DESC LIMIT 20`).all();
  const orders = db.prepare("SELECT COUNT(*) AS count, COALESCE(SUM(total_cents), 0) AS cents FROM orders WHERE status NOT IN ('CANCELLED', 'EXPIRED')").get();
  const completed = db.prepare("SELECT COUNT(*) AS count, COALESCE(SUM(total_cents), 0) AS cents FROM orders WHERE status NOT IN ('CANCELLED', 'EXPIRED') AND payment_status = 'APPROVED'").get();
  return { events, topProducts, orders: { count: orders.count, total: orders.cents / 100 }, completed: { count: completed.count, total: completed.cents / 100 } };
}
