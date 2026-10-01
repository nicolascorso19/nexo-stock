import { conflict, notFound, unprocessable } from '../errors.js';
import { bootstrapState } from '../db/bootstrap.js';
import { asBoolean, createId, nowIso, roundMoney } from '../utils.js';
import { recordAudit } from './audit.js';
import { insertMovement } from './stock.js';
import { optionalText, parseDateTime, positiveInteger, requireObject, requiredText } from '../validation.js';

function returnById(db, id) {
  return bootstrapState(db).returns.find(item => item.id === id) || null;
}

export function createSaleReturn(db, payload, user, request) {
  requireObject(payload);
  const saleId = requiredText(payload.saleId, 'La venta', { max: 120 });
  const returnDate = parseDateTime(payload.date, 'La fecha de la devolución', { required: false, fallback: nowIso() });
  const reason = requiredText(payload.reason, 'El motivo de la devolución', { max: 1000 });
  const rawItems = Array.isArray(payload.items) ? payload.items : [];
  if (!rawItems.length) throw unprocessable('Seleccioná al menos un producto para devolver.', 'EMPTY_RETURN');
  if (rawItems.length > 10_000) throw unprocessable('La devolución contiene demasiados productos.', 'TOO_MANY_ITEMS');

  return db.transaction(() => {
    const sale = db.prepare('SELECT * FROM sales WHERE id = ?').get(saleId);
    if (!sale) throw notFound('La venta');
    if (sale.status === 'ANNULLED') throw conflict('No se pueden hacer devoluciones sobre una venta anulada.', 'SALE_ALREADY_ANNULLED');
    const requestedCustomer = String(payload.customerId || '').trim();
    if (requestedCustomer && requestedCustomer !== (sale.customer_id || '')) throw conflict('La devolución no pertenece al cliente de la venta.', 'CUSTOMER_MISMATCH');
    const returnId = createId('return');
    const createdAt = nowIso();
    let anyRemaining = false;
    const prepared = [];
    const seenSaleItems = new Set();

    for (const raw of rawItems) {
      requireObject(raw, 'Cada ítem de devolución');
      const saleItemId = requiredText(raw.saleItemId, 'La línea de venta', { max: 120 });
      if (seenSaleItems.has(saleItemId)) throw unprocessable('No repitas una misma línea de venta en una devolución.', 'DUPLICATE_RETURN_ITEM');
      seenSaleItems.add(saleItemId);
      const item = db.prepare('SELECT * FROM sale_items WHERE id = ? AND sale_id = ?').get(saleItemId, saleId);
      if (!item) throw notFound('La línea de venta seleccionada');
      const quantity = positiveInteger(raw.quantity ?? 1, 'La cantidad a devolver', { max: 100_000 });
      const alreadyReturned = Number(db.prepare('SELECT COALESCE(SUM(quantity), 0) AS quantity FROM sale_return_items WHERE sale_item_id = ?').get(saleItemId).quantity);
      if (alreadyReturned + quantity > item.quantity) throw conflict('La cantidad a devolver supera la cantidad vendida.', 'RETURN_QUANTITY_EXCEEDED');
      if (item.serialized === 1 && quantity !== 1) throw unprocessable('Una unidad con IMEI se devuelve de a una unidad.', 'SERIAL_RETURN_MUST_BE_ONE');
      const restocked = asBoolean(raw.restocked, true);
      const unitCostKnown = item.cost_registered === 1;
      prepared.push({ item, quantity, restocked, unitCostKnown, alreadyReturned });
    }

    let returnStatus = 'COMPLETED';
    db.prepare(`INSERT INTO sale_returns (id, sale_id, customer_id, user_id, return_date, reason, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(returnId, saleId, sale.customer_id || null, user.id, returnDate, reason, returnStatus, createdAt);

    for (const entry of prepared) {
      const item = entry.item;
      const before = Number(db.prepare('SELECT quantity FROM inventory WHERE variant_id = ?').get(item.variant_id)?.quantity || 0);
      if (item.inventory_unit_id) {
        const unit = db.prepare('SELECT * FROM inventory_units WHERE id = ? AND variant_id = ?').get(item.inventory_unit_id, item.variant_id);
        if (!unit) throw notFound('La unidad vendida');
        if (unit.unit_status !== 'SOLD') throw conflict('La unidad no está en estado vendido.', 'UNIT_NOT_SOLD');
        const nextStatus = entry.restocked ? 'AVAILABLE' : 'RETURNED';
        const updated = db.prepare('UPDATE inventory_units SET unit_status = ?, updated_at = ? WHERE id = ? AND unit_status = \'SOLD\'').run(nextStatus, createdAt, item.inventory_unit_id);
        if (updated.changes !== 1) throw conflict('No se pudo actualizar la unidad devuelta.', 'UNIT_STATUS_CONFLICT');
      }
      const after = before + (entry.restocked ? entry.quantity : 0);
      if (entry.restocked) {
        const updated = db.prepare('UPDATE inventory SET quantity = quantity + ?, updated_at = ? WHERE variant_id = ?').run(entry.quantity, createdAt, item.variant_id);
        if (updated.changes !== 1) throw conflict('No se pudo devolver el stock.', 'STOCK_RESTORE_FAILED');
      }
      const returnItemId = createId('return_item');
      const lineTotal = roundMoney(Number(item.unit_price) * entry.quantity);
      db.prepare(`
        INSERT INTO sale_return_items (
          id, return_id, sale_item_id, variant_id, inventory_unit_id, quantity,
          unit_price, unit_cost, cost_registered, line_total, restocked, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(returnItemId, returnId, item.id, item.variant_id, item.inventory_unit_id || null, entry.quantity, item.unit_price, item.unit_cost, item.cost_registered, lineTotal, entry.restocked ? 1 : 0, createdAt);
      if (entry.restocked) {
        insertMovement(db, {
          variantId: item.variant_id, unitId: item.inventory_unit_id || null, userId: user.id,
          type: 'RETURN', quantity: entry.quantity, stockBefore: before, stockAfter: after,
          cost: entry.unitCostKnown ? Number(item.unit_cost) : null, price: Number(item.unit_price),
          reason, notes: `Devolución de venta ${saleId}`, referenceType: 'sale_return', referenceId: returnId,
          createdAt
        });
      }
      const remaining = item.quantity - entry.alreadyReturned - entry.quantity;
      if (remaining > 0) { anyRemaining = true; returnStatus = 'PARTIAL'; }
    }
    db.prepare('UPDATE sale_returns SET status = ? WHERE id = ?').run(returnStatus, returnId);
    const result = returnById(db, returnId);
    recordAudit(db, { userId: user.id, action: 'Devolución registrada', entityType: 'sale_return', entityId: returnId, before: { saleId, status: sale.status }, after: { saleId, reason, items: prepared.length, remaining: anyRemaining }, request, createdAt });
    return result;
  }).immediate();
}
