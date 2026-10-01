import { AppError, conflict, notFound, unprocessable } from '../errors.js';
import { createId, isValidImei, normalizeImei, nowIso } from '../utils.js';
import { movementTypeFromLabel, unitStatusLabel } from '../db/bootstrap.js';
import { getProductById } from '../db/bootstrap.js';
import { recordAudit } from './audit.js';
import { requireSupplier, findOrCreateLocation } from './catalog.js';
import { assertMinimumMargin, getSettings } from './settings.js';
import { expireReservations } from './reservations.js';
import {
  nonNegativeInteger,
  nonNegativeMoney,
  optionalText,
  parseDateOnly,
  parseDateTime,
  positiveInteger,
  requireObject,
  stringArray
} from '../validation.js';

function operationalVariant(db, id) {
  const row = db.prepare(`
    SELECT pv.*, p.archived, COALESCE(i.quantity, 0) AS stock,
           COALESCE(i.reserved_quantity, 0) AS reserved_stock,
           COALESCE(i.quantity, 0) - COALESCE(i.reserved_quantity, 0) AS available_stock,
           COALESCE(pv.supplier_id, '') AS supplier_id,
           COALESCE(l.name, '') AS location_name
    FROM product_variants pv
    JOIN products p ON p.id = pv.product_id
    LEFT JOIN inventory i ON i.variant_id = pv.id
    LEFT JOIN locations l ON l.id = pv.location_id
    WHERE pv.id = ?
  `).get(id);
  if (!row) throw notFound('El producto');
  if (row.archived || !row.active) throw conflict('El producto está archivado.', 'PRODUCT_ARCHIVED');
  return row;
}

function validateImeiList(db, rawImeis, quantity, requiresImei, label = 'IMEI') {
  if (requiresImei && quantity > 10_000) throw unprocessable('Un lote serializado admite hasta 10.000 unidades.', 'IMEI_BATCH_TOO_LARGE');
  const values = stringArray(rawImeis, label, { maxItems: 10_000, maxLength: 30 });
  const imeis = values.map(value => normalizeImei(value));
  const unique = new Set(imeis);
  if (unique.size !== imeis.length) throw unprocessable('El lote contiene IMEI duplicados.', 'DUPLICATE_IMEI');
  for (const imei of imeis) {
    if (!isValidImei(imei)) {
      throw unprocessable(`El IMEI ${imei} no cumple el formato ni el dígito verificador Luhn.`, 'INVALID_IMEI');
    }
    if (db.prepare('SELECT id FROM inventory_units WHERE imei = ? COLLATE NOCASE OR imei_2 = ? COLLATE NOCASE').get(imei, imei)) {
      throw conflict(`El IMEI ${imei} ya está registrado.`, 'DUPLICATE_IMEI');
    }
  }
  if (requiresImei && imeis.length !== quantity) {
    throw unprocessable(`Ingresá ${quantity} IMEI${quantity === 1 ? '' : 's'} para este producto.`, 'IMEI_COUNT_MISMATCH');
  }
  if (!requiresImei && imeis.length) {
    throw unprocessable('Este producto se maneja por cantidad y no admite IMEI.', 'IMEI_NOT_ALLOWED');
  }
  return imeis;
}

function insertMovement(db, movement) {
  const id = createId('mov');
  db.prepare(`
    INSERT INTO stock_movements (
      id, variant_id, inventory_unit_id, user_id, movement_type, quantity,
      stock_before, stock_after, cost, price, reason, notes, reference_type,
      reference_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    movement.variantId,
    movement.unitId || null,
    movement.userId,
    movement.type,
    movement.quantity,
    movement.stockBefore,
    movement.stockAfter,
    movement.cost ?? null,
    movement.price ?? null,
    movement.reason,
    movement.notes || null,
    movement.referenceType || null,
    movement.referenceId || null,
    movement.createdAt
  );
  try {
    const clients = db.prepare('SELECT id FROM service_clients WHERE active = 1').all();
    const payload = JSON.stringify({ variantId: movement.variantId, quantity: movement.quantity, stockAfter: movement.stockAfter, type: 'stock.changed' });
    for (const client of clients) db.prepare('INSERT INTO commerce_events (id, client_id, event_type, aggregate_id, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(createId('event'), client.id, 'stock.changed', movement.variantId, payload, movement.createdAt);
  } catch { /* commerce events are an integration side channel */ }
  return id;
}

export function addStock(db, payload, user, request) {
  requireObject(payload);
  expireReservations(db);
  return db.transaction(() => {
    const productId = String(payload.productId || '').trim();
    const variant = operationalVariant(db, productId);
    const quantity = positiveInteger(payload.quantity, 'La cantidad', { max: 100_000 });
    const costSupplied = payload.unitCost !== undefined && payload.unitCost !== null && String(payload.unitCost) !== '';
    const unitCost = costSupplied
      ? nonNegativeMoney(payload.unitCost, 'El costo unitario')
      : variant.cost_registered === 1 ? Number(variant.cost || 0) : 0;
    const costKnown = costSupplied || variant.cost_registered === 1;
    // Precio de venta opcional: si viene informed se registra junto al stock,
    // así el producto queda listo para vender sin editarlo por separado.
    const priceSupplied = payload.salePrice !== undefined && payload.salePrice !== null && String(payload.salePrice) !== '';
    const salePrice = priceSupplied ? nonNegativeMoney(payload.salePrice, 'El precio de venta') : Number(variant.sale_price || 0);
    const salePriceKnown = priceSupplied || variant.sale_price_registered === 1;
    const settings = getSettings(db);
    assertMinimumMargin(salePrice, unitCost, settings, {
      priceKnown: salePriceKnown,
      costKnown
    });

    const imeis = validateImeiList(db, payload.imeis, quantity, variant.requires_imei === 1);
    const serialNumbers = stringArray(payload.serialNumbers, 'Los números de serie', { maxItems: 10_000, maxLength: 120 });
    if (serialNumbers.length > quantity) throw unprocessable('Hay más números de serie que unidades.', 'SERIAL_COUNT_MISMATCH');
    const supplierPayload = payload.supplierId === undefined ? variant.supplier_id : payload.supplierId;
    const supplier = requireSupplier(db, String(supplierPayload || '').trim() || null);
    const locationName = optionalText(payload.location, 'La ubicación', { max: 100 }) || variant.location_name || 'Local';
    const location = findOrCreateLocation(db, locationName);
    const entryDate = parseDateOnly(payload.date, 'La fecha de ingreso', nowIso().slice(0, 10));
    const notes = optionalText(payload.notes, 'Las notas', { max: 4000 });
    const reason = optionalText(payload.reason, 'El motivo', { max: 300 }) || 'Ingreso de stock';
    const now = nowIso();
    const before = Number(variant.stock);

    const inventoryUpdate = db.prepare(`
      UPDATE inventory SET quantity = quantity + ?, updated_at = ?
      WHERE variant_id = ? AND quantity >= 0
    `).run(quantity, now, productId);
    if (inventoryUpdate.changes !== 1) throw conflict('No se pudo actualizar el inventario.', 'STOCK_UPDATE_FAILED');

    db.prepare(`
      UPDATE product_variants SET cost = ?, cost_registered = ?, sale_price = ?, sale_price_registered = ?, supplier_id = ?, location_id = ?, purchase_date = ?, updated_at = ?
      WHERE id = ?
    `).run(unitCost, costKnown ? 1 : 0, salePrice, salePriceKnown ? 1 : 0, supplier?.id || null, location.id, entryDate, now, productId);

    const unitIds = [];
    if (variant.requires_imei === 1) {
      const insertUnit = db.prepare(`
        INSERT INTO inventory_units (
          id, variant_id, purchase_item_id, imei, imei_2, serial_number, unit_status,
          condition, physical_state, cost, cost_registered, sale_price, sale_price_registered,
          entry_date, supplier_id, location_id, notes, is_fictional, created_at, updated_at
        ) VALUES (?, ?, NULL, ?, NULL, ?, 'AVAILABLE', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
      `);
      imeis.forEach((imei, index) => {
        const unitId = createId('unit');
        unitIds.push(unitId);
        insertUnit.run(
          unitId,
          productId,
          imei,
          serialNumbers[index] || null,
          variant.condition,
          variant.physical_state,
          unitCost,
          costKnown ? 1 : 0,
          variant.sale_price_registered === 1 ? Number(variant.sale_price || 0) : 0,
          variant.sale_price_registered === 1 ? 1 : 0,
          entryDate,
          supplier?.id || null,
          location.id,
          notes || null,
          now,
          now
        );
      });
    }

    const movementId = insertMovement(db, {
      variantId: productId,
      unitId: unitIds[0] || null,
      userId: user.id,
      type: 'MANUAL_IN',
      quantity,
      stockBefore: before,
      stockAfter: before + quantity,
      cost: unitCost,
      reason,
      notes,
      referenceType: 'manual_stock',
      referenceId: unitIds[0] || null,
      createdAt: now
    });
    const product = getProductById(db, productId);
    recordAudit(db, {
      userId: user.id,
      action: 'Stock agregado',
      entityType: 'product_variant',
      entityId: productId,
      before: { stock: before },
      after: { stock: before + quantity, movementId },
      request
    });
    return { product, movementId, unitsCreated: unitIds.length };
  }).immediate();
}

function outgoingStatus(type) {
  if (type === 'LOSS') return 'LOST';
  if (type === 'REPAIR') return 'REPAIR';
  return 'RETIRED';
}

export function removeStock(db, payload, user, request) {
  requireObject(payload);
  expireReservations(db);
  return db.transaction(() => {
    const productId = String(payload.productId || '').trim();
    const variant = operationalVariant(db, productId);
    const quantity = positiveInteger(payload.quantity, 'La cantidad', { max: 100_000 });
    const requestedType = movementTypeFromLabel(payload.type || 'Salida manual');
    const type = requestedType || 'MANUAL_OUT';
    if (!['MANUAL_OUT', 'LOSS', 'REPAIR', 'ADJUSTMENT', 'TRANSFER'].includes(type)) {
      throw unprocessable('El tipo de salida no está permitido en este endpoint.', 'INVALID_MOVEMENT_TYPE');
    }

    const before = Number(variant.stock);
    const available = Number(variant.available_stock ?? before);
    if (available < quantity) throw conflict(`Stock insuficiente. Disponible: ${available}.`, 'INSUFFICIENT_STOCK');
    const requestedIds = stringArray(payload.unitIds, 'Las unidades', { maxItems: 100_000, maxLength: 120 });
    const uniqueIds = new Set(requestedIds);
    if (uniqueIds.size !== requestedIds.length) throw unprocessable('La lista contiene unidades duplicadas.', 'DUPLICATE_UNIT');

    let units = [];
    if (variant.requires_imei === 1) {
      if (requestedIds.length) {
        if (requestedIds.length !== quantity) throw unprocessable('La cantidad debe coincidir con las unidades seleccionadas.', 'UNIT_COUNT_MISMATCH');
        units = requestedIds.map(unitId => db.prepare('SELECT * FROM inventory_units WHERE id = ?').get(unitId));
      } else {
        units = db.prepare(`
          SELECT * FROM inventory_units
          WHERE variant_id = ? AND unit_status = 'AVAILABLE'
          ORDER BY created_at, id LIMIT ?
        `).all(productId, quantity);
      }
      if (units.some(unit => !unit) || units.length !== quantity) {
        throw unprocessable('La cantidad no coincide con unidades disponibles.', 'UNIT_COUNT_MISMATCH');
      }
      if (units.some(unit => unit.variant_id !== productId || unit.unit_status !== 'AVAILABLE')) {
        throw conflict('Una unidad seleccionada no pertenece al producto o no está disponible.', 'UNIT_NOT_AVAILABLE');
      }
    }

    const now = parseDateTime(payload.date, 'La fecha del movimiento', { required: false, fallback: nowIso() });
    const reason = optionalText(payload.reason, 'El motivo', { max: 300 });
    if (!reason) throw unprocessable('Indicá el motivo de la salida de stock.', 'REASON_REQUIRED');
    const notes = optionalText(payload.notes, 'Las notas', { max: 4000 });
    const inventoryUpdate = db.prepare(`
      UPDATE inventory SET quantity = quantity - ?, updated_at = ?
      WHERE variant_id = ? AND quantity - reserved_quantity >= ?
    `).run(quantity, now, productId, quantity);
    if (inventoryUpdate.changes !== 1) throw conflict('Stock insuficiente o actualización concurrente.', 'INSUFFICIENT_STOCK');

    const movementIds = [];
    let runningStock = before;
    if (units.length) {
      const updateUnit = db.prepare(`
        UPDATE inventory_units SET unit_status = ?, updated_at = ?
        WHERE id = ? AND variant_id = ? AND unit_status = 'AVAILABLE'
      `);
      for (const unit of units) {
        const updated = updateUnit.run(outgoingStatus(type), now, unit.id, productId);
        if (updated.changes !== 1) throw conflict(`La unidad ${unit.imei || unit.id} ya no está disponible.`, 'UNIT_NOT_AVAILABLE');
        runningStock -= 1;
        movementIds.push(insertMovement(db, {
          variantId: productId,
          unitId: unit.id,
          userId: user.id,
          type,
          quantity: -1,
          stockBefore: runningStock + 1,
          stockAfter: runningStock,
          cost: Number(unit.cost),
          reason,
          notes,
          referenceType: 'manual_stock',
          referenceId: unit.id,
          createdAt: now
        }));
      }
    } else {
      runningStock -= quantity;
      movementIds.push(insertMovement(db, {
        variantId: productId,
        unitId: null,
        userId: user.id,
        type,
        quantity: -quantity,
        stockBefore: before,
        stockAfter: runningStock,
        cost: Number(variant.cost),
        reason,
        notes,
        referenceType: 'manual_stock',
        referenceId: null,
        createdAt: now
      }));
    }

    const product = getProductById(db, productId);
    recordAudit(db, {
      userId: user.id,
      action: 'Stock retirado',
      entityType: 'product_variant',
      entityId: productId,
      before: { stock: before },
      after: { stock: before - quantity, movementIds, status: unitStatusLabel(outgoingStatus(type)) },
      request
    });
    return { product, movementIds };
  }).immediate();
}

export function inventoryReconciliation(db) {
  const rows = db.prepare(`
    SELECT pv.id, pv.variant_name, pv.requires_imei,
           COALESCE(i.quantity, 0) AS recorded_stock,
           b.name AS brand, pm.name AS model
    FROM product_variants pv
    JOIN products p ON p.id = pv.product_id
    JOIN product_models pm ON pm.id = p.model_id
    JOIN brands b ON b.id = pm.brand_id
    LEFT JOIN inventory i ON i.variant_id = pv.id
    WHERE p.archived = 0 AND pv.active = 1
    ORDER BY pm.name, pv.variant_name
  `).all();
  const items = rows.map(row => {
    const physical = row.requires_imei === 1
      ? db.prepare("SELECT COUNT(*) AS count FROM inventory_units WHERE variant_id = ? AND unit_status IN ('AVAILABLE', 'RESERVED')").get(row.id).count
      : Number(row.recorded_stock);
    const difference = physical - Number(row.recorded_stock);
    return {
      variantId: row.id,
      productName: `${row.brand} ${row.model}`,
      variant: row.variant_name,
      recordedStock: Number(row.recorded_stock),
      physicalStock: physical,
      difference,
      status: difference === 0 ? 'OK' : 'DIFFERENCE',
      serialized: row.requires_imei === 1
    };
  });
  const orphanUnits = db.prepare(`
    SELECT iu.id, iu.variant_id, iu.imei FROM inventory_units iu
    LEFT JOIN product_variants pv ON pv.id = iu.variant_id
    WHERE pv.id IS NULL OR iu.unit_status NOT IN ('AVAILABLE', 'RESERVED', 'SOLD', 'REPAIR', 'RETURNED', 'LOST', 'RETIRED')
  `).all().map(row => ({ id: row.id, variantId: row.variant_id, imei: row.imei || '' }));
  return {
    checkedAt: nowIso(),
    ok: items.every(item => item.status === 'OK') && orphanUnits.length === 0,
    items,
    orphanUnits,
    summary: {
      variants: items.length,
      differences: items.filter(item => item.status !== 'OK').length,
      orphanUnits: orphanUnits.length
    }
  };
}

export function reconcileInventory(db, payload, user, request) {
  requireObject(payload);
  const variantId = String(payload.variantId || payload.productId || '').trim();
  const reason = optionalText(payload.reason, 'El motivo de la conciliación', { max: 300 });
  if (!reason) throw unprocessable('Indicá el motivo de la conciliación.', 'REASON_REQUIRED');
  return db.transaction(() => {
    const variant = operationalVariant(db, variantId);
    const before = Number(variant.stock);
    const serialized = variant.requires_imei === 1;
    const physical = serialized
      ? db.prepare("SELECT COUNT(*) AS count FROM inventory_units WHERE variant_id = ? AND unit_status IN ('AVAILABLE', 'RESERVED')").get(variantId).count
      : nonNegativeInteger(payload.physicalStock, 'El stock físico', { max: 100_000_000 });
    if (serialized && payload.physicalStock !== undefined && Number(payload.physicalStock) !== physical) {
      throw conflict('Un producto con IMEI sólo puede conciliarse después de registrar o corregir sus unidades físicas.', 'SERIALIZED_RECONCILIATION_REQUIRES_UNITS');
    }
    const reserved = Number(variant.reserved_stock || 0);
    if (physical < reserved) throw conflict(`El ajuste no puede quedar por debajo de ${reserved} unidades reservadas.`, 'RESERVED_STOCK_CONFLICT');
    const difference = physical - before;
    if (difference === 0) return { variantId, before, after: before, difference: 0, unchanged: true, reconciliation: null };
    const now = nowIso();
    const update = db.prepare('UPDATE inventory SET quantity = ?, updated_at = ? WHERE variant_id = ? AND quantity >= 0').run(physical, now, variantId);
    if (update.changes !== 1) throw conflict('No se pudo conciliar el inventario.', 'STOCK_UPDATE_FAILED');
    const movementId = insertMovement(db, {
      variantId, userId: user.id, type: 'ADJUSTMENT', quantity: difference,
      stockBefore: before, stockAfter: physical, cost: variant.cost_registered === 1 ? Number(variant.cost) : null,
      reason: `Conciliación: ${reason}`, notes: optionalText(payload.notes, 'Las notas', { max: 4000 }),
      referenceType: 'inventory_reconciliation', referenceId: null, createdAt: now
    });
    const reconciliationId = createId('rec');
    db.prepare(`INSERT INTO inventory_reconciliations (id, variant_id, user_id, recorded_stock, physical_stock, difference, reason, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(reconciliationId, variantId, user.id, before, physical, difference, reason, optionalText(payload.notes, 'Las notas', { max: 4000 }) || null, now);
    recordAudit(db, { userId: user.id, action: 'Inventario conciliado', entityType: 'product_variant', entityId: variantId, before: { stock: before }, after: { stock: physical, reconciliationId, movementId }, request });
    return { variantId, before, after: physical, difference, reconciliationId, movementId };
  }).immediate();
}

export { operationalVariant, validateImeiList, insertMovement };
