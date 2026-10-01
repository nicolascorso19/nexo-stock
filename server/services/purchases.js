import { conflict, notFound, unprocessable } from '../errors.js';
import { bootstrapState } from '../db/bootstrap.js';
import { createId, nowIso, roundMoney, sha256, stableStringify } from '../utils.js';
import { recordAudit } from './audit.js';
import { findOrCreateLocation, requireSupplier } from './catalog.js';
import { normalizePaymentStatus, requirePaymentMethod } from './commerce.js';
import { assertMinimumMargin, getSettings } from './settings.js';
import { insertMovement, operationalVariant, validateImeiList } from './stock.js';
import {
  nonNegativeMoney,
  optionalText,
  parseDateOnly,
  positiveInteger,
  requireObject,
  stringArray
} from '../validation.js';

function requestHash(payload, idempotencyKey) {
  const copy = { ...payload };
  delete copy.idempotencyKey;
  return sha256(stableStringify({ ...copy, idempotencyKey: idempotencyKey || null }));
}

function purchaseById(db, id) {
  return bootstrapState(db).purchases.find(purchase => purchase.id === id) || null;
}

function findReplay(db, idempotencyKey, hash) {
  if (!idempotencyKey) return null;
  const existing = db.prepare('SELECT id, request_hash FROM purchases WHERE idempotency_key = ?').get(idempotencyKey);
  if (!existing) return null;
  if (existing.request_hash !== hash) {
    throw conflict('La clave de idempotencia ya fue usada con otra compra.', 'IDEMPOTENCY_KEY_REUSED');
  }
  return { purchase: purchaseById(db, existing.id), replayed: true };
}

export function createPurchase(db, payload, user, request, idempotencyKey = null) {
  requireObject(payload);
  return db.transaction(() => {
    const hash = requestHash(payload, idempotencyKey);
    const replay = findReplay(db, idempotencyKey, hash);
    if (replay) return replay;

    const supplierId = String(payload.supplierId || '').trim();
    const supplier = requireSupplier(db, supplierId);
    if (!supplier) throw unprocessable('Seleccioná un proveedor válido.', 'SUPPLIER_REQUIRED');
    const rawItems = Array.isArray(payload.items) ? payload.items : [];
    if (!rawItems.length) throw unprocessable('Agregá al menos un producto a la compra.', 'EMPTY_PURCHASE');
    if (rawItems.length > 10_000) throw unprocessable('La compra contiene demasiados productos.', 'TOO_MANY_ITEMS');

    const purchaseDate = parseDateOnly(payload.date, 'La fecha de compra', nowIso().slice(0, 10));
    const paymentMethod = requirePaymentMethod(db, payload.paymentMethod, 'Transferencia');
    const paymentStatus = normalizePaymentStatus(payload.paymentStatus, 'PAID');
    const globalDiscount = nonNegativeMoney(payload.discount ?? 0, 'El descuento de la compra');
    const notes = optionalText(payload.notes, 'Las notas', { max: 4000 });
    const locationPayload = optionalText(payload.location, 'La ubicación', { max: 100 });
    const settings = getSettings(db);
    const seenVariants = new Set();
    const prepared = [];

    for (const rawItem of rawItems) {
      requireObject(rawItem, 'Cada ítem de compra');
      const productId = String(rawItem.productId || '').trim();
      if (!productId) throw unprocessable('Cada ítem debe incluir productId.', 'REQUIRED_FIELD');
      if (seenVariants.has(productId)) throw unprocessable('No se puede repetir el mismo producto en una compra.', 'DUPLICATE_PURCHASE_ITEM');
      seenVariants.add(productId);
      const variant = operationalVariant(db, productId);
      const quantity = positiveInteger(rawItem.quantity, 'La cantidad comprada', { max: 100_000 });
      const unitCost = nonNegativeMoney(rawItem.unitCost ?? rawItem.cost, 'El costo unitario');
      assertMinimumMargin(Number(variant.sale_price), unitCost, settings, {
        priceKnown: variant.sale_price_registered === 1,
        costKnown: true
      });
      const imeis = validateImeiList(db, rawItem.imeis, quantity, variant.requires_imei === 1, 'Los IMEI de la compra');
      const serialNumbers = stringArray(rawItem.serialNumbers, 'Los números de serie', { maxItems: 100_000, maxLength: 120 });
      if (serialNumbers.length > quantity) throw unprocessable('Hay más números de serie que unidades.', 'SERIAL_COUNT_MISMATCH');
      const lineTotal = roundMoney(quantity * unitCost);
      prepared.push({ variant, productId, quantity, unitCost, lineTotal, imeis, serialNumbers });
    }

    const subtotal = roundMoney(prepared.reduce((sum, item) => sum + item.lineTotal, 0));
    if (globalDiscount > subtotal || (subtotal > 0 && globalDiscount >= subtotal)) {
      throw unprocessable('El descuento no puede superar el subtotal de la compra.', 'INVALID_PURCHASE_DISCOUNT');
    }
    if (subtotal === 0 && globalDiscount !== 0) throw unprocessable('Una compra sin costo no puede tener descuento.', 'INVALID_PURCHASE_DISCOUNT');
    const total = roundMoney(subtotal - globalDiscount);
    const createdAt = nowIso();
    const purchaseId = createId('purchase');
    const location = locationPayload ? findOrCreateLocation(db, locationPayload) : null;

    db.prepare(`
      INSERT INTO purchases (
        id, supplier_id, user_id, purchase_date, payment_method, payment_status,
        subtotal, discount, total, cost_total, notes, idempotency_key,
        request_hash, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      purchaseId,
      supplier.id,
      user.id,
      `${purchaseDate}T12:00:00.000Z`,
      paymentMethod,
      paymentStatus,
      subtotal,
      globalDiscount,
      total,
      subtotal,
      notes,
      idempotencyKey,
      hash,
      createdAt
    );

    for (const item of prepared) {
      const purchaseItemId = createId('purchase_item');
      db.prepare(`
        INSERT INTO purchase_items (id, purchase_id, variant_id, quantity, unit_cost, line_total)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(purchaseItemId, purchaseId, item.productId, item.quantity, item.unitCost, item.lineTotal);

      const before = Number(item.variant.stock);
      const previousCost = item.variant.cost_registered === 1 ? Number(item.variant.cost || 0) : 0;
      const totalUnits = before + item.quantity;
      const averageCost = totalUnits > 0 ? roundMoney(((before * previousCost) + (item.quantity * item.unitCost)) / totalUnits) : 0;
      const inventoryUpdate = db.prepare(`
        UPDATE inventory SET quantity = quantity + ?, updated_at = ?
        WHERE variant_id = ? AND quantity >= 0
      `).run(item.quantity, createdAt, item.productId);
      if (inventoryUpdate.changes !== 1) throw conflict('No se pudo aumentar el inventario.', 'STOCK_UPDATE_FAILED');

      const locationId = location?.id || item.variant.location_id || null;
      db.prepare(`
        UPDATE product_variants SET
          cost = ?, cost_registered = 1, supplier_id = ?, location_id = ?, purchase_date = ?, updated_at = ?
        WHERE id = ?
      `).run(averageCost, supplier.id, locationId, purchaseDate, createdAt, item.productId);

      let firstUnitId = null;
      if (item.variant.requires_imei === 1) {
        const insertUnit = db.prepare(`
          INSERT INTO inventory_units (
            id, variant_id, purchase_item_id, imei, imei_2, serial_number, unit_status,
            condition, physical_state, cost, cost_registered, sale_price, sale_price_registered,
            entry_date, supplier_id, location_id, notes, is_fictional, created_at, updated_at
          ) VALUES (?, ?, ?, ?, NULL, ?, 'AVAILABLE', ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
        `);
        item.imeis.forEach((imei, index) => {
          const unitId = createId('unit');
          if (!firstUnitId) firstUnitId = unitId;
          insertUnit.run(
            unitId,
            item.productId,
            purchaseItemId,
            imei,
            item.serialNumbers[index] || null,
            item.variant.condition,
            item.variant.physical_state,
            item.unitCost,
            1,
            item.variant.sale_price_registered === 1 ? Number(item.variant.sale_price || 0) : 0,
            item.variant.sale_price_registered === 1 ? 1 : 0,
            purchaseDate,
            supplier.id,
            locationId,
            notes || null,
            createdAt,
            createdAt
          );
        });
      }

      insertMovement(db, {
        variantId: item.productId,
        unitId: firstUnitId,
        userId: user.id,
        type: 'PURCHASE',
        quantity: item.quantity,
        stockBefore: before,
        stockAfter: before + item.quantity,
        cost: item.unitCost,
        reason: 'Compra a proveedor',
        notes,
        referenceType: 'purchase',
        referenceId: purchaseId,
        createdAt
      });
    }

    db.prepare(`
      INSERT INTO payments (
        id, sale_id, purchase_id, payment_method, amount, payment_status,
        reference, paid_at, created_at
      ) VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      createId('payment'),
      purchaseId,
      paymentMethod,
      total,
      paymentStatus,
      idempotencyKey,
      paymentStatus === 'PAID' ? purchaseDate : null,
      createdAt
    );

    const purchase = purchaseById(db, purchaseId);
    recordAudit(db, {
      userId: user.id,
      action: 'Compra registrada',
      entityType: 'purchase',
      entityId: purchaseId,
      before: null,
      after: { total, supplierId: supplier.id, itemCount: prepared.length },
      request
    });
    return { purchase, replayed: false };
  }).immediate();
}
