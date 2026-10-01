import { AppError, conflict, notFound, unprocessable } from '../errors.js';
import { createId, nowIso, roundMoney, sha256, stableStringify, randomToken } from '../utils.js';
import { getSettings } from './settings.js';
import { insertMovement } from './stock.js';
import { recordAudit } from './audit.js';
import { ensureConfiguredCommerceClient } from './commerce-auth.js';
import { optionalText } from '../validation.js';

export function ensureCommerceRuntime(db, config) {
  const client = ensureConfiguredCommerceClient(db, config);
  return { configured: Boolean(client), client };
}

export function commerceCatalog(db, config = {}) {
  expireCommerceHolds(db);
  const settings = getSettings(db);
  // El catálogo real excluye siempre lo ficticio. La inclusión es una concesión
  // exclusiva de desarrollo, defendida además por config.includeFictional, que
  // getConfig() rechaza en producción.
  const fictionalClause = config.includeFictional === true
    ? ''
    : 'AND p.is_fictional = 0 AND pv.is_fictional = 0';
  // Variantes sin precio registrado: por defecto no se publican, porque no son
  // vendibles. Si se habilita commercePublishWithoutPrice se publican igual
  // (catálogo visual); el e-commerce impide comprarlas con PRICE_NOT_REGISTERED.
  const priceClause = config.commercePublishWithoutPrice === true ? '' : 'AND pv.sale_price_registered = 1';
  const allowUnpriced = config.commercePublishWithoutPrice === true;
  const rows = db.prepare(`
    SELECT p.id AS product_id, p.public_slug, p.public_description,
           p.public_images_json, p.public_highlights_json, p.public_specs_json,
           p.published, p.is_trending, p.published_at,
           pv.id AS variant_id, pv.variant_name, pv.sku, pv.ram, pv.condition,
           pv.physical_state, pv.requires_imei, pv.sale_price, pv.sale_price_registered,
           pv.promo_price, pv.previous_price, pv.promo_starts_at, pv.promo_ends_at, pv.apple_official_price_usd,
           pv.public_images_json AS variant_images_json, pv.min_stock,
           b.id AS brand_id, b.name AS brand, pm.id AS model_id, pm.name AS model,
           cat.id AS category_id, cat.name AS category,
           cp.name AS capacity, cl.name AS color,
           COALESCE(i.quantity, 0) AS quantity, COALESCE(i.reserved_quantity, 0) AS reserved_quantity,
           (SELECT COUNT(*) FROM inventory_units iu WHERE iu.variant_id = pv.id AND iu.unit_status = 'AVAILABLE') AS available_units
    FROM product_variants pv
    JOIN products p ON p.id = pv.product_id
    JOIN product_models pm ON pm.id = p.model_id
    JOIN brands b ON b.id = pm.brand_id
    JOIN categories cat ON cat.id = p.category_id
    LEFT JOIN capacities cp ON cp.id = pv.capacity_id
    LEFT JOIN colors cl ON cl.id = pv.color_id
    LEFT JOIN inventory i ON i.variant_id = pv.id
    WHERE p.published = 1 AND pv.published = 1 AND p.archived = 0 AND pv.active = 1
      ${fictionalClause} ${priceClause}
    ORDER BY p.published_at DESC, pm.name, pv.variant_name
  `).all();
  const grouped = new Map();
  for (const row of rows) {
    const productId = String(row.product_id);
    if (!grouped.has(productId)) grouped.set(productId, {
      id: productId,
      name: `${row.brand} ${row.model}`,
      slug: row.public_slug || slug(`${row.brand}-${row.model}-${productId}`),
      description: row.public_description || '',
      brand: row.brand,
      brandId: row.brand_id,
      model: row.model,
      modelId: row.model_id,
      category: row.category,
      categoryId: row.category_id,
      images: safeArray(row.public_images_json),
      highlights: safeArray(row.public_highlights_json),
      specifications: safeObject(row.public_specs_json),
      published: true,
      isTrending: row.is_trending === 1,
      publishedAt: row.published_at || null,
      variants: []
    });
    const price = currentPrice(row);
    // Sin precio registrado la variante no se publica (no es vendible), salvo
    // que se pida el catálogo visual: entonces viaja con priceKnown=false y la
    // tienda la muestra como "Consultar" sin possibility de comprarla.
    if (price === null && !allowUnpriced) continue;
    const available = row.requires_imei === 1 ? Number(row.available_units || 0) : Math.max(0, Number(row.quantity || 0) - Number(row.reserved_quantity || 0));
    const lowThreshold = Math.max(1, Number(row.min_stock || settings.lastUnitThreshold || 1));
    grouped.get(productId).variants.push({
      id: row.variant_id,
      productId,
      sku: row.sku,
      capacity: row.capacity || '',
      color: row.color || '',
      ram: row.ram || '',
      condition: row.condition || 'Nuevo',
      physicalState: row.physical_state || '',
      requiresImei: row.requires_imei === 1,
      price: price ? price.amount : null,
      priceKnown: price !== null,
      previousPrice: price ? price.previous : null,
      appleOfficialPrice: settings.publicShowApplePrice && row.apple_official_price_usd !== null && row.apple_official_price_usd !== undefined ? Number(row.apple_official_price_usd) : null,
      availableQuantity: available,
      lowStockThreshold: lowThreshold,
      availability: available <= 0 ? 'OUT' : available <= lowThreshold ? 'LOW' : 'IN',
      published: true,
      images: safeArray(row.variant_images_json).length ? safeArray(row.variant_images_json) : safeArray(row.public_images_json),
      updatedAt: nowIso()
    });
  }
  const products = [...grouped.values()].filter(product => product.variants.length > 0);
  return {
    business: { name: settings.businessName, location: settings.locationName, currency: 'USD' },
    catalogVersion: sha256(products.map(product => `${product.id}:${product.variants.map(variant => `${variant.id}:${variant.price}:${variant.availableQuantity}`).join('|')}`).join('||')).slice(0, 24),
    generatedAt: nowIso(),
    products
  };
}

export function createCommerceHold(db, config, request) {
  const payload = request.body || {};
  const externalOrderId = text(payload.externalOrderId, 'externalOrderId', 160);
  const rawItems = Array.isArray(payload.items) ? payload.items : [];
  if (!rawItems.length || rawItems.length > 50) throw unprocessable('La reserva debe contener entre 1 y 50 líneas.', 'INVALID_HOLD_ITEMS');
  const items = rawItems.map((item) => ({ variantId: text(item.variantId, 'variantId', 160), quantity: positiveInt(item.quantity, 'quantity', 99) }));
  if (new Set(items.map((item) => item.variantId)).size !== items.length) throw unprocessable('No repitas una variante en la misma reserva.', 'DUPLICATE_HOLD_VARIANT');
  const idempotencyKey = text(request.get('Idempotency-Key'), 'Idempotency-Key', 160);
  const hash = sha256(stableStringify({ externalOrderId, items }));
  return db.transaction(() => {
    const previous = db.prepare('SELECT * FROM commerce_holds WHERE client_id = ? AND idempotency_key = ?').get(request.integrationClient.id, idempotencyKey);
    if (previous) {
      if (previous.request_hash !== hash) throw conflict('La clave de idempotencia ya fue usada con otra reserva.', 'IDEMPOTENCY_KEY_REUSED');
      return { hold: publicHold(db, previous.id), replayed: true };
    }
    const sameOrder = db.prepare('SELECT * FROM commerce_holds WHERE client_id = ? AND external_order_id = ?').get(request.integrationClient.id, externalOrderId);
    if (sameOrder) {
      if (sameOrder.request_hash !== hash) throw conflict('El pedido externo ya tiene otra reserva.', 'EXTERNAL_ORDER_CONFLICT');
      return { hold: publicHold(db, sameOrder.id), replayed: true };
    }
    const now = nowIso();
    const expiresAt = new Date(Date.now() + config.commerceReservationTtlSeconds * 1000).toISOString();
    const prepared = [];
    for (const item of items) {
      const variant = db.prepare(`
        SELECT pv.*, p.archived, p.published AS product_published, p.is_fictional AS product_fictional,
               b.name AS brand, pm.name AS model, cat.name AS category
        FROM product_variants pv JOIN products p ON p.id = pv.product_id
        JOIN product_models pm ON pm.id = p.model_id JOIN brands b ON b.id = pm.brand_id
        JOIN categories cat ON cat.id = p.category_id
        WHERE pv.id = ?
      `).get(item.variantId);
      const isFictional = variant && (variant.product_fictional === 1 || variant.is_fictional === 1);
      if (isFictional && config.includeFictional !== true) throw notFound('La variante publicada');
      if (!variant || variant.archived || !variant.active || variant.published !== 1 || variant.product_published !== 1) throw notFound('La variante publicada');
      const price = currentPrice(variant);
      if (price === null) throw unprocessable('La variante no tiene precio de venta registrado.', 'PRICE_NOT_REGISTERED');
      if (variant.requires_imei === 1 && item.quantity !== 1) throw unprocessable('Una variante con IMEI se reserva de a una unidad.', 'SERIAL_QUANTITY_MUST_BE_ONE');
      const inventory = db.prepare('SELECT quantity, reserved_quantity FROM inventory WHERE variant_id = ?').get(item.variantId);
      if (!inventory) throw conflict('La variante no tiene inventario inicializado.', 'INVENTORY_NOT_INITIALIZED');
      const available = variant.requires_imei === 1
        ? Number(db.prepare("SELECT COUNT(*) AS count FROM inventory_units WHERE variant_id = ? AND unit_status = 'AVAILABLE'").get(item.variantId).count)
        : Number(inventory.quantity) - Number(inventory.reserved_quantity || 0);
      if (available < item.quantity) throw conflict(`No hay stock disponible para ${variant.variant_name || item.variantId}.`, 'INSUFFICIENT_STOCK');
      let unit = null;
      if (variant.requires_imei === 1) {
        unit = db.prepare("SELECT * FROM inventory_units WHERE variant_id = ? AND unit_status = 'AVAILABLE' ORDER BY created_at, id LIMIT 1").get(item.variantId);
        if (!unit) throw conflict('La unidad disponible ya fue reservada.', 'UNIT_NOT_AVAILABLE');
        const changed = db.prepare("UPDATE inventory_units SET unit_status = 'RESERVED', updated_at = ? WHERE id = ? AND variant_id = ? AND unit_status = 'AVAILABLE'").run(now, unit.id, item.variantId);
        if (changed.changes !== 1) throw conflict('La unidad disponible cambió.', 'UNIT_NOT_AVAILABLE');
      }
      const reserved = db.prepare('UPDATE inventory SET reserved_quantity = reserved_quantity + ?, updated_at = ? WHERE variant_id = ? AND quantity - reserved_quantity >= ?').run(item.quantity, now, item.variantId, item.quantity);
      if (reserved.changes !== 1) throw conflict('No hay stock disponible para reservar.', 'INSUFFICIENT_STOCK');
      prepared.push({ ...item, variant, unit, unitPrice: price.amount });
    }
    const subtotal = roundMoney(prepared.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0));
    if (subtotal <= 0) throw unprocessable('El total de la reserva debe ser mayor a cero.', 'INVALID_HOLD_TOTAL');
    const holdId = createId('commerce_hold');
    db.prepare(`INSERT INTO commerce_holds (id, client_id, external_order_id, status, idempotency_key, request_hash, subtotal, total, expires_at, created_at, updated_at) VALUES (?, ?, ?, 'ACTIVE', ?, ?, ?, ?, ?, ?, ?)`)
      .run(holdId, request.integrationClient.id, externalOrderId, idempotencyKey, hash, subtotal, subtotal, expiresAt, now, now);
    for (const item of prepared) {
      db.prepare(`INSERT INTO commerce_hold_items (id, hold_id, variant_id, quantity, unit_id, unit_price, line_total, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(createId('commerce_item'), holdId, item.variantId, item.quantity, item.unit?.id || null, item.unitPrice, roundMoney(item.quantity * item.unitPrice), now);
    }
    const result = { hold: publicHold(db, holdId), replayed: false };
    db.prepare('INSERT INTO commerce_hold_events (id, hold_id, operation, idempotency_key, request_hash, response_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(createId('commerce_event'), holdId, 'CREATE', idempotencyKey, hash, JSON.stringify(result.hold), now);
    recordAudit(db, { action: 'Reserva e-commerce creada', entityType: 'commerce_hold', entityId: holdId, after: { externalOrderId, expiresAt, lines: prepared.length } });
    recordCommerceEvent(db, request.integrationClient.id, 'hold.created', holdId, { holdId, externalOrderId, status: 'ACTIVE', expiresAt });
    return result;
  }).immediate();
}

export function getCommerceHold(db, request, holdId) {
  expireCommerceHolds(db);
  const hold = db.prepare('SELECT * FROM commerce_holds WHERE id = ? AND client_id = ?').get(holdId, request.integrationClient.id);
  if (!hold) throw notFound('La reserva');
  return publicHold(db, hold.id);
}

export function releaseCommerceHold(db, request, holdId) {
  return mutateHold(db, request, holdId, 'RELEASE');
}

export function confirmCommerceHold(db, request, holdId) {
  return mutateHold(db, request, holdId, 'CONFIRM');
}

function mutateHold(db, request, holdId, operation) {
  expireCommerceHolds(db);
  const idempotencyKey = text(request.get('Idempotency-Key'), 'Idempotency-Key', 160);
  const requestHash = sha256(stableStringify({ operation, holdId }));
  return db.transaction(() => {
    const existingEvent = db.prepare('SELECT * FROM commerce_hold_events WHERE hold_id = ? AND operation = ?').get(holdId, operation);
    const hold = db.prepare('SELECT * FROM commerce_holds WHERE id = ? AND client_id = ?').get(holdId, request.integrationClient.id);
    if (!hold) throw notFound('La reserva');
    if (existingEvent) {
      if (existingEvent.request_hash !== requestHash) throw conflict('La clave de idempotencia no coincide.', 'IDEMPOTENCY_KEY_REUSED');
      return { hold: publicHold(db, hold.id), saleId: hold.confirmed_sale_id, replayed: true };
    }
    if (hold.status === 'CONFIRMED') {
      if (operation === 'CONFIRM') return { hold: publicHold(db, hold.id), saleId: hold.confirmed_sale_id, replayed: true };
      throw conflict('La reserva ya fue confirmada.', 'HOLD_ALREADY_CONFIRMED');
    }
    if (hold.status !== 'ACTIVE') throw conflict('La reserva ya no está activa.', 'HOLD_NOT_ACTIVE');
    if (new Date(hold.expires_at).getTime() <= Date.now()) {
      releaseHoldInternal(db, hold, 'EXPIRED');
      throw new AppError(410, 'HOLD_EXPIRED', 'La reserva expiró.');
    }
    if (operation === 'RELEASE') {
      releaseHoldInternal(db, hold, 'RELEASED');
      db.prepare('INSERT INTO commerce_hold_events (id, hold_id, operation, idempotency_key, request_hash, response_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(createId('commerce_event'), hold.id, operation, idempotencyKey, requestHash, JSON.stringify(publicHold(db, hold.id)), nowIso());
      recordCommerceEvent(db, request.integrationClient.id, 'hold.released', hold.id, { holdId: hold.id, externalOrderId: hold.external_order_id, status: 'RELEASED' });
      return { hold: publicHold(db, hold.id), replayed: false };
    }
    const sale = confirmHoldInternal(db, hold, request);
    db.prepare('INSERT INTO commerce_hold_events (id, hold_id, operation, idempotency_key, request_hash, response_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(createId('commerce_event'), hold.id, operation, idempotencyKey, requestHash, JSON.stringify({ saleId: sale.id, status: 'CONFIRMED' }), nowIso());
    recordCommerceEvent(db, request.integrationClient.id, 'sale.confirmed', hold.id, { holdId: hold.id, externalOrderId: hold.external_order_id, saleId: sale.id, status: 'CONFIRMED' });
    return { hold: publicHold(db, hold.id), saleId: sale.id, replayed: false };
  }).immediate();
}

function releaseHoldInternal(db, hold, status) {
  const now = nowIso();
  const items = db.prepare('SELECT * FROM commerce_hold_items WHERE hold_id = ?').all(hold.id);
  for (const item of items) {
    if (item.unit_id) db.prepare("UPDATE inventory_units SET unit_status = 'AVAILABLE', updated_at = ? WHERE id = ? AND variant_id = ? AND unit_status = 'RESERVED'").run(now, item.unit_id, item.variant_id);
    const changed = db.prepare('UPDATE inventory SET reserved_quantity = MAX(0, reserved_quantity - ?), updated_at = ? WHERE variant_id = ?').run(item.quantity, now, item.variant_id);
    if (changed.changes !== 1) throw conflict('No se pudo liberar el stock reservado.', 'STOCK_RELEASE_FAILED');
  }
  db.prepare('UPDATE commerce_holds SET status = ?, updated_at = ? WHERE id = ?').run(status, now, hold.id);
}

function confirmHoldInternal(db, hold, request) {
  const now = nowIso();
  const items = db.prepare('SELECT * FROM commerce_hold_items WHERE hold_id = ? ORDER BY id').all(hold.id);
  if (!items.length) throw conflict('La reserva no tiene líneas.', 'EMPTY_HOLD');
  const user = serviceUser(db, request.integrationClient.id);
  const saleId = createId('sale');
  const prepared = [];
  let subtotal = 0;
  let costTotal = 0;
  let profitKnown = true;
  for (const item of items) {
    const variant = db.prepare('SELECT * FROM product_variants WHERE id = ?').get(item.variant_id);
    if (!variant) throw conflict('La variante ya no existe.', 'VARIANT_NOT_FOUND');
    const inventory = db.prepare('SELECT quantity, reserved_quantity FROM inventory WHERE variant_id = ?').get(item.variant_id);
    if (!inventory || inventory.reserved_quantity < item.quantity) throw conflict('La reserva no coincide con el stock.', 'RESERVATION_STOCK_DRIFT');
    const unit = item.unit_id ? db.prepare('SELECT * FROM inventory_units WHERE id = ? AND variant_id = ?').get(item.unit_id, item.variant_id) : null;
    if (item.unit_id && (!unit || unit.unit_status !== 'RESERVED')) throw conflict('La unidad reservada no está disponible.', 'UNIT_NOT_RESERVED');
    const costKnown = unit ? unit.cost_registered === 1 : variant.cost_registered === 1;
    const unitCost = costKnown ? Number(unit?.cost ?? variant.cost ?? 0) : 0;
    profitKnown = profitKnown && costKnown;
    costTotal += unitCost * item.quantity;
    subtotal += Number(item.unit_price) * item.quantity;
    prepared.push({ item, variant, unit, inventory, costKnown, unitCost });
  }
  const total = roundMoney(subtotal);
  const profit = profitKnown ? roundMoney(total - costTotal) : 0;
  db.prepare(`INSERT INTO sales (id, customer_id, user_id, sale_date, payment_method, payment_status, subtotal, discount, total, cost_total, profit_total, profit_known, status, notes, idempotency_key, request_hash, created_at) VALUES (?, NULL, ?, ?, 'Ecommerce', 'PAID', ?, 0, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?, ?)`)
    .run(saleId, user.id, now, roundMoney(subtotal), total, profitKnown ? roundMoney(costTotal) : 0, profit, profitKnown ? 1 : 0, `Pedido e-commerce ${hold.external_order_id}`, `commerce-confirm-${hold.id}`, sha256(hold.request_hash), now);
  for (const line of prepared) {
    const { item, unit, inventory, costKnown, unitCost } = line;
    const before = Number(inventory.quantity);
    const changed = db.prepare('UPDATE inventory SET quantity = quantity - ?, reserved_quantity = reserved_quantity - ?, updated_at = ? WHERE variant_id = ? AND quantity >= ? AND reserved_quantity >= ?').run(item.quantity, item.quantity, now, item.variant_id, item.quantity, item.quantity);
    if (changed.changes !== 1) throw conflict('No se pudo confirmar el stock.', 'INSUFFICIENT_STOCK');
    if (unit) {
      const unitChanged = db.prepare("UPDATE inventory_units SET unit_status = 'SOLD', sale_price = ?, sale_price_registered = 1, updated_at = ? WHERE id = ? AND unit_status = 'RESERVED'").run(item.unit_price, now, unit.id);
      if (unitChanged.changes !== 1) throw conflict('La unidad reservada no pudo venderse.', 'UNIT_NOT_RESERVED');
    }
    const saleItemId = createId('sale_item');
    db.prepare(`INSERT INTO sale_items (id, sale_id, variant_id, inventory_unit_id, serialized, quantity, unit_price, discount, unit_cost, cost_registered, line_total) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`)
      .run(saleItemId, saleId, item.variant_id, item.unit_id, item.unit_id ? 1 : 0, item.quantity, item.unit_price, unitCost, costKnown ? 1 : 0, roundMoney(Number(item.unit_price) * item.quantity));
    insertMovement(db, { variantId: item.variant_id, unitId: item.unit_id, userId: user.id, type: 'SALE', quantity: -item.quantity, stockBefore: before, stockAfter: before - item.quantity, cost: costKnown ? unitCost : null, price: Number(item.unit_price), reason: 'Venta e-commerce confirmada', referenceType: 'commerce_hold', referenceId: hold.id, createdAt: now });
  }
  db.prepare(`INSERT INTO payments (id, sale_id, purchase_id, payment_method, amount, payment_status, reference, paid_at, created_at) VALUES (?, ?, NULL, 'Ecommerce', ?, 'PAID', ?, ?, ?)`)
    .run(createId('payment'), saleId, total, hold.external_order_id, now, now);
  db.prepare("UPDATE commerce_holds SET status = 'CONFIRMED', confirmed_sale_id = ?, updated_at = ? WHERE id = ?").run(saleId, now, hold.id);
  recordAudit(db, { action: 'Venta e-commerce confirmada', entityType: 'sale', entityId: saleId, after: { holdId: hold.id, total, externalOrderId: hold.external_order_id } });
  return { id: saleId };
}

export function cancelCommerceOrder(db, request, externalOrderId) {
  const hold = db.prepare('SELECT * FROM commerce_holds WHERE client_id = ? AND external_order_id = ?').get(request.integrationClient.id, externalOrderId);
  if (!hold || !hold.confirmed_sale_id) throw notFound('El pedido confirmado');
  return db.transaction(() => {
    const sale = db.prepare('SELECT * FROM sales WHERE id = ?').get(hold.confirmed_sale_id);
    if (!sale) throw notFound('La venta');
    if (sale.status === 'ANNULLED') return { cancelled: true, saleId: sale.id, replayed: true, refundRequired: sale.payment_status === 'PAID' };
    if (db.prepare('SELECT 1 FROM sale_return_items sri JOIN sale_items si ON si.id = sri.sale_item_id WHERE si.sale_id = ? LIMIT 1').get(sale.id)) {
      throw conflict('La venta ya tiene devoluciones; la cancelación requiere revisión manual para no duplicar stock.', 'SALE_HAS_RETURNS');
    }
    const now = nowIso();
    const items = db.prepare('SELECT * FROM sale_items WHERE sale_id = ?').all(sale.id);
    for (const item of items) {
      const before = Number(db.prepare('SELECT quantity FROM inventory WHERE variant_id = ?').get(item.variant_id)?.quantity || 0);
      if (item.inventory_unit_id) db.prepare("UPDATE inventory_units SET unit_status = 'AVAILABLE', updated_at = ? WHERE id = ? AND unit_status = 'SOLD'").run(now, item.inventory_unit_id);
      db.prepare('UPDATE inventory SET quantity = quantity + ?, updated_at = ? WHERE variant_id = ?').run(item.quantity, now, item.variant_id);
      insertMovement(db, { variantId: item.variant_id, unitId: item.inventory_unit_id, userId: serviceUser(db, request.integrationClient.id).id, type: 'SALE_ANNULMENT', quantity: item.quantity, stockBefore: before, stockAfter: before + item.quantity, cost: item.cost_registered === 1 ? Number(item.unit_cost) : null, price: Number(item.unit_price), reason: 'Cancelación de pedido e-commerce', referenceType: 'commerce_order', referenceId: externalOrderId, createdAt: now });
    }
    db.prepare("UPDATE sales SET status = 'ANNULLED', payment_status = 'PENDING', annul_reason = ?, annulled_at = ?, annulled_by = ? WHERE id = ?").run('Cancelación solicitada por e-commerce', now, serviceUser(db, request.integrationClient.id).id, sale.id);
    db.prepare("UPDATE commerce_holds SET status = 'RELEASED', updated_at = ? WHERE id = ?").run(now, hold.id);
    recordAudit(db, { action: 'Pedido e-commerce anulado', entityType: 'sale', entityId: sale.id, after: { externalOrderId, refundRequired: true } });
    return { cancelled: true, saleId: sale.id, replayed: false, refundRequired: true };
  }).immediate();
}

export function expireCommerceHolds(db) {
  const now = nowIso();
  const rows = db.prepare("SELECT * FROM commerce_holds WHERE status = 'ACTIVE' AND expires_at <= ?").all(now);
  for (const hold of rows) {
    try { db.transaction(() => releaseHoldInternal(db, hold, 'EXPIRED')).immediate(); } catch (error) { console.error('No se pudo expirar la reserva', hold.id, error.message); }
  }
  return rows.length;
}

function publicHold(db, holdId) {
  const hold = db.prepare('SELECT * FROM commerce_holds WHERE id = ?').get(holdId);
  if (!hold) throw notFound('La reserva');
  const items = db.prepare('SELECT variant_id, quantity, unit_price, line_total FROM commerce_hold_items WHERE hold_id = ? ORDER BY id').all(hold.id);
  return { reservationId: hold.id, externalOrderId: hold.external_order_id, status: hold.status, currency: hold.currency, subtotal: Number(hold.subtotal), total: Number(hold.total), expiresAt: hold.expires_at, items: items.map(item => ({ variantId: item.variant_id, quantity: item.quantity, unitPrice: Number(item.unit_price), lineTotal: Number(item.line_total) })), saleId: hold.confirmed_sale_id };
}

function currentPrice(row) {
  if (row.sale_price_registered !== 1) return null;
  const base = Number(row.sale_price);
  if (!Number.isFinite(base) || base <= 0) return null;
  const now = Date.now();
  const starts = row.promo_starts_at ? Date.parse(row.promo_starts_at) : -Infinity;
  const ends = row.promo_ends_at ? Date.parse(row.promo_ends_at) : Infinity;
  const promo = row.promo_price !== null && row.promo_price !== undefined && Number(row.promo_price) > 0 && Number(row.promo_price) < base && now >= starts && now <= ends ? Number(row.promo_price) : null;
  return { amount: promo ?? base, previous: promo ? base : (row.previous_price ? Number(row.previous_price) : null) };
}

function serviceUser(db, clientId) {
  const id = `service_user_${clientId}`;
  const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (existing) return existing;
  const role = db.prepare("SELECT id FROM roles WHERE name = 'Administrador' OR id = 'admin' LIMIT 1").get();
  if (!role) throw new Error('No existe el rol interno para el servicio e-commerce.');
  db.prepare(`INSERT INTO users (id, role_id, name, email, password_hash, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?)`)
    .run(id, role.id, `Servicio Ecommerce ${clientId}`, `${id}@service.invalid`, `disabled-${randomToken(24)}`, nowIso(), nowIso());
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

function recordCommerceEvent(db, clientId, type, aggregateId, payload) {
  db.prepare('INSERT INTO commerce_events (id, client_id, event_type, aggregate_id, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(createId('event'), clientId, type, aggregateId, JSON.stringify(payload), nowIso());
}

function text(value, field, max) { const result = String(value ?? '').trim(); if (!result || result.length > max) throw unprocessable(`${field} es inválido.`, 'VALIDATION_ERROR'); return result; }
function positiveInt(value, field, max) { const result = Number(value); if (!Number.isInteger(result) || result < 1 || result > max) throw unprocessable(`${field} debe ser un entero positivo.`, 'VALIDATION_ERROR'); return result; }
function safeArray(value) { try { const parsed = JSON.parse(value || '[]'); return Array.isArray(parsed) ? parsed.filter(item => typeof item === 'string' && safeImageUrl(item)) : []; } catch { return []; } }
/**
 * URL de imagen publicable. Acepta http(s) absolutas y rutas del propio sitio
 * que empiezan por "/" (las imágenes del catálogo se sirven en /img/catalog/...
 * tanto en el sistema privado como en el e-commerce). Rechaza javascript:,
 * data:, y las rutas protocol-relative "//host" que se camuflan de relativas.
 */
function safeImageUrl(value) { const item = String(value).trim(); return /^https?:\/\//i.test(item) || /^\/(?!\/)/.test(item); }
function safeObject(value) { try { const parsed = JSON.parse(value || '{}'); return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}; } catch { return {}; } }
function slug(value) { return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }

// Compatibilidad con el dominio de ventas/compras existente.
export function normalizePaymentStatus(value, fallback = 'PAID') {
  const normalized = String(value || fallback).trim().toUpperCase();
  const aliases = { PAGADA: 'PAID', PAGA: 'PAID', PAID: 'PAID', PARCIAL: 'PARTIAL', PARTIAL: 'PARTIAL', PENDIENTE: 'PENDING', PENDING: 'PENDING', REEMBOLSADA: 'REFUNDED', REFUNDED: 'REFUNDED' };
  const status = aliases[normalized];
  if (!status) throw unprocessable('El estado de pago no es válido.', 'INVALID_PAYMENT_STATUS');
  return status;
}

export function paymentStatusLabel(value) {
  return { PAID: 'Pagada', PARTIAL: 'Parcial', PENDING: 'Pendiente', REFUNDED: 'Reembolsada' }[value] || value;
}

export function requirePaymentMethod(db, value, fallback = 'Efectivo') {
  const method = optionalText(value, 'El medio de pago', { max: 100 }) || fallback;
  const row = db.prepare("SELECT value FROM options WHERE option_type = 'payment_method' AND value = ? COLLATE NOCASE AND active = 1").get(method);
  if (!row) throw unprocessable('El medio de pago no está habilitado.', 'INVALID_PAYMENT_METHOD');
  return row.value;
}

export function normalizeIdempotencyKey(value) {
  const key = String(value || '').trim();
  if (!key) return null;
  if (key.length > 128 || !/^[A-Za-z0-9._:-]+$/.test(key)) throw unprocessable('Idempotency-Key debe tener hasta 128 caracteres alfanuméricos.', 'INVALID_IDEMPOTENCY_KEY');
  return key;
}
