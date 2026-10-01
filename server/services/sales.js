import { conflict, notFound, unprocessable } from '../errors.js';
import { bootstrapState } from '../db/bootstrap.js';
import { createId, nowIso, roundMoney, sha256, stableStringify } from '../utils.js';
import { recordAudit } from './audit.js';
import { requireCustomer } from './catalog.js';
import { normalizePaymentStatus, requirePaymentMethod } from './commerce.js';
import { insertMovement, operationalVariant } from './stock.js';
import { expireReservations } from './reservations.js';
import {
  nonNegativeMoney,
  optionalText,
  parseDateTime,
  positiveInteger,
  positiveMoney,
  requireObject
} from '../validation.js';

function requestHash(payload, idempotencyKey) {
  const copy = { ...payload };
  delete copy.idempotencyKey;
  return sha256(stableStringify({ ...copy, idempotencyKey: idempotencyKey || null }));
}

function saleById(db, id) {
  return bootstrapState(db).sales.find(sale => sale.id === id) || null;
}

function findReplay(db, idempotencyKey, hash) {
  if (!idempotencyKey) return null;
  const existing = db.prepare('SELECT id, request_hash FROM sales WHERE idempotency_key = ?').get(idempotencyKey);
  if (!existing) return null;
  if (existing.request_hash !== hash) throw conflict('La clave de idempotencia ya fue usada con otra venta.', 'IDEMPOTENCY_KEY_REUSED');
  return { sale: saleById(db, existing.id), replayed: true };
}

function unitCostFor(variant, unit) {
  if (unit && unit.cost_registered === 1) return { cost: Number(unit.cost || 0), known: true };
  if (variant.cost_registered === 1) return { cost: Number(variant.cost || 0), known: true };
  return { cost: 0, known: false };
}

export function createSale(db, payload, user, request, idempotencyKey = null) {
  requireObject(payload);
  expireReservations(db);
  return db.transaction(() => {
    const hash = requestHash(payload, idempotencyKey);
    const replay = findReplay(db, idempotencyKey, hash);
    if (replay) return replay;

    const rawItems = Array.isArray(payload.items) ? payload.items : [];
    if (!rawItems.length) throw unprocessable('Agregá al menos un producto a la venta.', 'EMPTY_SALE');
    if (rawItems.length > 10_000) throw unprocessable('La venta contiene demasiados productos.', 'TOO_MANY_ITEMS');

    const saleDate = parseDateTime(payload.date, 'La fecha de venta', { required: false, fallback: nowIso() });
    const customer = requireCustomer(db, String(payload.customerId || '').trim() || null);
    const paymentMethod = requirePaymentMethod(db, payload.paymentMethod, 'Efectivo');
    const paymentStatus = normalizePaymentStatus(payload.paymentStatus, 'PAID');
    const globalDiscount = nonNegativeMoney(payload.discount ?? 0, 'El descuento global');
    const notes = optionalText(payload.notes, 'Las notas', { max: 4000 });
    const usedUnits = new Set();
    const prepared = [];

    for (const rawItem of rawItems) {
      requireObject(rawItem, 'Cada ítem de venta');
      const productId = String(rawItem.productId || rawItem.variantId || '').trim();
      if (!productId) throw unprocessable('Cada ítem debe incluir la variante seleccionada.', 'REQUIRED_FIELD');
      const variant = operationalVariant(db, productId);
      const quantity = positiveInteger(rawItem.quantity ?? 1, 'La cantidad vendida', { max: 100_000 });
      const suppliedPrice = rawItem.price ?? rawItem.salePrice;
      const price = suppliedPrice !== undefined && suppliedPrice !== null && String(suppliedPrice) !== ''
        ? positiveMoney(suppliedPrice, 'El precio de venta')
        : variant.sale_price_registered === 1 ? Number(variant.sale_price) : 0;
      if (!(price > 0)) throw unprocessable('La variante no tiene precio de venta registrado. Cargá el precio antes de vender.', 'PRICE_NOT_REGISTERED');
      const discount = nonNegativeMoney(rawItem.discount ?? 0, 'El descuento del ítem');
      const gross = roundMoney(quantity * price);
      const lineTotal = roundMoney(gross - discount);
      if (lineTotal <= 0 || discount > gross) throw unprocessable('El descuento no puede superar el importe del ítem.', 'INVALID_ITEM_DISCOUNT');

      let unit = null;
      if (variant.requires_imei === 1) {
        if (quantity !== 1) throw unprocessable('Un producto con IMEI se vende de a una unidad.', 'SERIAL_QUANTITY_MUST_BE_ONE');
        const unitId = String(rawItem.unitId || rawItem.unit_id || '').trim();
        if (!unitId) throw unprocessable('Seleccioná una unidad disponible para la variante con IMEI.', 'UNIT_REQUIRED');
        unit = db.prepare('SELECT * FROM inventory_units WHERE id = ?').get(unitId);
        if (!unit || unit.variant_id !== productId) throw notFound('La unidad seleccionada');
        if (unit.unit_status !== 'AVAILABLE') throw conflict('La unidad seleccionada está reservada, vendida o no disponible.', 'UNIT_NOT_AVAILABLE');
        if (usedUnits.has(unit.id)) throw unprocessable('La misma unidad no puede repetirse en una venta.', 'DUPLICATE_SALE_UNIT');
        usedUnits.add(unit.id);
      } else if (rawItem.unitId || rawItem.unit_id) {
        throw unprocessable('Una variante manejada por cantidad no admite unitId.', 'UNIT_NOT_ALLOWED');
      }
      const costData = unitCostFor(variant, unit);
      prepared.push({ variant, productId, quantity, price, discount, lineTotal, unit, ...costData });
    }

    // El subtotal es el importe neto de las líneas (ya incluye los
    // descuentos por ítem). El descuento de cabecera se aplica una sola vez
    // sobre ese subtotal; así el total coincide con el detalle persistido y
    // con el importe cobrado.
    const subtotal = roundMoney(prepared.reduce((sum, item) => sum + item.lineTotal, 0));
    const total = roundMoney(subtotal - globalDiscount);
    if (total <= 0 || globalDiscount >= subtotal) throw unprocessable('El descuento global debe ser menor al subtotal.', 'INVALID_SALE_DISCOUNT');
    const profitKnown = prepared.every(item => item.known);
    const costTotal = profitKnown ? roundMoney(prepared.reduce((sum, item) => sum + item.cost * item.quantity, 0)) : 0;
    const createdAt = nowIso();
    const saleId = createId('sale');

    db.prepare(`
      INSERT INTO sales (
        id, customer_id, user_id, sale_date, payment_method, payment_status,
        subtotal, discount, total, cost_total, profit_total, profit_known, status,
        notes, idempotency_key, request_hash, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?, ?)
    `).run(saleId, customer?.id || null, user.id, saleDate, paymentMethod, paymentStatus, subtotal, globalDiscount, total, costTotal, profitKnown ? roundMoney(total - costTotal) : 0, profitKnown ? 1 : 0, notes, idempotencyKey, hash, createdAt);

    for (const item of prepared) {
      const before = Number(db.prepare('SELECT quantity FROM inventory WHERE variant_id = ?').get(item.productId)?.quantity || 0);
      const availableClause = item.variant.requires_imei === 1
        ? `AND (SELECT COUNT(*) FROM inventory_units WHERE variant_id = ? AND unit_status = 'AVAILABLE') >= ?`
        : 'AND quantity - COALESCE(reserved_quantity, 0) >= ?';
      const parameters = item.variant.requires_imei === 1
        ? [item.quantity, createdAt, item.productId, item.quantity, item.productId, item.quantity]
        : [item.quantity, createdAt, item.productId, item.quantity, item.quantity];
      const inventoryUpdate = db.prepare(`UPDATE inventory SET quantity = quantity - ?, updated_at = ? WHERE variant_id = ? AND quantity >= ? ${availableClause}`).run(...parameters);
      if (inventoryUpdate.changes !== 1) throw conflict(`No hay stock disponible para ${item.variant.variant_name || item.productId}.`, 'INSUFFICIENT_STOCK');

      const itemId = createId('sale_item');
      db.prepare(`
        INSERT INTO sale_items (
          id, sale_id, variant_id, inventory_unit_id, serialized, quantity,
          unit_price, discount, unit_cost, cost_registered, line_total
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(itemId, saleId, item.productId, item.unit?.id || null, item.variant.requires_imei === 1 ? 1 : 0, item.quantity, item.price, item.discount, item.cost, item.known ? 1 : 0, item.lineTotal);

      if (item.unit) {
        const unitUpdate = db.prepare(`UPDATE inventory_units SET unit_status = 'SOLD', sale_price = ?, sale_price_registered = 1, updated_at = ? WHERE id = ? AND variant_id = ? AND unit_status = 'AVAILABLE'`).run(item.price, createdAt, item.unit.id, item.productId);
        if (unitUpdate.changes !== 1) throw conflict('La unidad dejó de estar disponible.', 'UNIT_NOT_AVAILABLE');
      }
      insertMovement(db, {
        variantId: item.productId,
        unitId: item.unit?.id || null,
        userId: user.id,
        type: 'SALE',
        quantity: -item.quantity,
        stockBefore: before,
        stockAfter: before - item.quantity,
        cost: item.known ? item.cost : null,
        price: item.price,
        reason: 'Venta registrada',
        notes,
        referenceType: 'sale',
        referenceId: saleId,
        createdAt
      });
    }

    db.prepare(`INSERT INTO payments (id, sale_id, purchase_id, payment_method, amount, payment_status, reference, paid_at, created_at) VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?)`)
      .run(createId('payment'), saleId, paymentMethod, total, paymentStatus, idempotencyKey, paymentStatus === 'PAID' ? saleDate : null, createdAt);

    const sale = saleById(db, saleId);
    recordAudit(db, { userId: user.id, action: 'Venta registrada', entityType: 'sale', entityId: saleId, before: null, after: { total, cost: profitKnown ? costTotal : null, profit: profitKnown ? roundMoney(total - costTotal) : null, customerId: customer?.id || null, variantIds: prepared.map(item => item.productId) }, request });
    return { sale, replayed: false };
  }).immediate();
}

export function annulSale(db, id, payload, user, request) {
  requireObject(payload);
  return db.transaction(() => {
    const sale = db.prepare('SELECT * FROM sales WHERE id = ?').get(id);
    if (!sale) throw notFound('La venta');
    if (sale.status === 'ANNULLED') return saleById(db, id);
    const reason = optionalText(payload.reason, 'El motivo de la anulación', { max: 500 });
    if (!reason) throw unprocessable('Indicá el motivo de la anulación.', 'REASON_REQUIRED');
    const items = db.prepare('SELECT * FROM sale_items WHERE sale_id = ? ORDER BY rowid').all(id);
    if (!items.length) throw unprocessable('La venta no tiene líneas para devolver.', 'SALE_WITHOUT_ITEMS');
    const now = nowIso();
    for (const item of items) {
      const before = Number(db.prepare('SELECT quantity FROM inventory WHERE variant_id = ?').get(item.variant_id)?.quantity || 0);
      const returned = db.prepare(`
        SELECT COALESCE(SUM(quantity), 0) AS returned_quantity,
               COALESCE(SUM(CASE WHEN restocked = 1 THEN quantity ELSE 0 END), 0) AS restocked_quantity
        FROM sale_return_items WHERE sale_item_id = ?
      `).get(item.id);
      // Una devolución con reingreso ya devolvió esa parte al stock. La
      // anulación sólo repone la cantidad que nunca volvió, evitando duplicar
      // stock cuando una venta ya tuvo devoluciones parciales.
      const restockedQuantity = Math.min(item.quantity, Number(returned?.restocked_quantity || 0));
      const restoreQuantity = item.quantity - restockedQuantity;

      if (item.inventory_unit_id) {
        const unit = db.prepare('SELECT * FROM inventory_units WHERE id = ? AND variant_id = ?').get(item.inventory_unit_id, item.variant_id);
        if (!unit || !['SOLD', 'RETURNED', 'AVAILABLE'].includes(unit.unit_status)) {
          throw conflict(`La unidad ${unit?.imei || item.inventory_unit_id} no está en un estado que pueda anularse.`, 'UNIT_NOT_SOLD');
        }
        if (restoreQuantity > 0 && unit.unit_status === 'AVAILABLE') {
          throw conflict('La unidad ya está disponible y no se puede reponer dos veces.', 'UNIT_STATUS_CONFLICT');
        }
        if (unit.unit_status !== 'AVAILABLE') {
          const updated = db.prepare("UPDATE inventory_units SET unit_status = 'AVAILABLE', updated_at = ? WHERE id = ? AND unit_status IN ('SOLD', 'RETURNED')").run(now, item.inventory_unit_id);
          if (updated.changes !== 1) throw conflict('No se pudo devolver la unidad a disponible.', 'UNIT_STATUS_CONFLICT');
        }
      }
      const after = before + restoreQuantity;
      if (restoreQuantity > 0) {
        const updated = db.prepare('UPDATE inventory SET quantity = quantity + ?, updated_at = ? WHERE variant_id = ?').run(restoreQuantity, now, item.variant_id);
        if (updated.changes !== 1) throw conflict('No se pudo devolver el stock de la venta.', 'STOCK_RESTORE_FAILED');
        insertMovement(db, {
          variantId: item.variant_id, unitId: item.inventory_unit_id, userId: user.id,
          type: 'RETURN', quantity: restoreQuantity, stockBefore: before, stockAfter: after,
          cost: item.cost_registered === 1 ? Number(item.unit_cost) : null,
          price: Number(item.unit_price), reason: `Anulación de venta: ${reason}`,
          notes: `Venta ${sale.id}`, referenceType: 'sale_annulment', referenceId: sale.id, createdAt: now
        });
      }
    }
    db.prepare("UPDATE sales SET status = 'ANNULLED', payment_status = 'REFUNDED', annul_reason = ?, annulled_at = ?, annulled_by = ? WHERE id = ?").run(reason, now, user.id, id);
    const annulled = saleById(db, id);
    recordAudit(db, { userId: user.id, action: 'Venta anulada', entityType: 'sale', entityId: id, before: { status: 'ACTIVA' }, after: { status: 'ANULADA', reason, items: items.length }, request, createdAt: now });
    return annulled;
  }).immediate();
}
