import { conflict, unprocessable } from '../errors.js';
import { bootstrapState } from '../db/bootstrap.js';
import { recordAudit } from './audit.js';
import { createProduct } from './products.js';
import { addStock } from './stock.js';
import { requireObject } from '../validation.js';

function normalizedKey(row) {
  return [row.brand, row.model, row.capacity || '', row.color || ''].map(value => String(value || '').trim().toLowerCase()).join('|');
}

export function importProducts(db, payload, user, request) {
  requireObject(payload);
  const rows = Array.isArray(payload.rows) ? payload.rows : [];
  if (!rows.length) throw unprocessable('El archivo no contiene productos para importar.', 'EMPTY_IMPORT');
  if (rows.length > 5000) throw unprocessable('La importación está limitada a 5000 filas por operación.', 'IMPORT_TOO_LARGE');

  return db.transaction(() => {
    const state = bootstrapState(db);
    const existingKeys = new Set(state.products.map(normalizedKey));
    const existingSkus = new Set(state.products.map(product => String(product.sku || '').toUpperCase()));
    const existingImeis = new Set(state.units.map(unit => String(unit.imei || '').toUpperCase()).filter(Boolean));
    const seenKeys = new Set();
    const seenSkus = new Set();
    const seenImeis = new Set();

    const prepared = rows.map((raw, index) => {
      requireObject(raw, `La fila ${index + 1}`);
      const imeis = Array.isArray(raw.imeis)
        ? raw.imeis.map(value => String(value).replace(/\s/g, '').toUpperCase()).filter(Boolean)
        : [];
      const stock = Number(raw.stock || 0);
      const requiresImei = imeis.length > 0;
      if (!Number.isInteger(stock) || stock < 0) throw unprocessable(`La fila ${index + 1} tiene un stock inválido.`, 'INVALID_IMPORT_STOCK');
      if (requiresImei && stock !== imeis.length) throw unprocessable(`La fila ${index + 1} debe tener un IMEI por cada unidad de stock.`, 'IMPORT_IMEI_COUNT_MISMATCH');
      if (!requiresImei && stock === 0 && raw.requiresImei === true) throw unprocessable(`La fila ${index + 1} requiere IMEI pero no tiene stock.`, 'IMPORT_IMEI_REQUIRED');

      const row = { ...raw, stock, imeis, requiresImei };
      const key = normalizedKey(row);
      const sku = String(row.sku || '').trim().toUpperCase();
      if (seenKeys.has(key)) throw conflict(`La fila ${index + 1} duplica una variante incluida en el mismo archivo.`, 'DUPLICATE_IMPORT_VARIANT');
      if (existingKeys.has(key)) throw conflict(`La fila ${index + 1} ya existe en el catálogo.`, 'DUPLICATE_IMPORT_VARIANT');
      if (sku && (seenSkus.has(sku) || existingSkus.has(sku))) throw conflict(`El SKU de la fila ${index + 1} ya está en uso.`, 'DUPLICATE_IMPORT_SKU');
      seenKeys.add(key);
      if (sku) seenSkus.add(sku);

      for (const imei of imeis) {
        if (!/^\d{15}$/.test(imei) || seenImeis.has(imei) || existingImeis.has(imei)) {
          throw conflict(`El IMEI ${imei} de la fila ${index + 1} es inválido o ya está registrado.`, 'DUPLICATE_IMPORT_IMEI');
        }
        seenImeis.add(imei);
      }
      return row;
    });

    const imported = [];
    for (const row of prepared) {
      const product = createProduct(db, {
        brand: row.brand,
        model: row.model,
        capacity: row.capacity,
        color: row.color,
        category: row.category || 'Celulares',
        cost: row.cost,
        price: row.price,
        minStock: row.minStock,
        sku: row.sku || undefined,
        requiresImei: row.requiresImei
      }, user, request);
      if (row.stock > 0) {
        addStock(db, {
          productId: product.id,
          quantity: row.stock,
          unitCost: row.cost,
          imeis: row.imeis,
          serialNumbers: Array.isArray(row.serialNumbers) ? row.serialNumbers : [],
          reason: 'Importación CSV'
        }, user, request);
      }
      imported.push(product.id);
    }

    recordAudit(db, {
      userId: user.id,
      action: 'Importación de productos',
      entityType: 'product_import',
      entityId: `import_${Date.now()}`,
      before: null,
      after: { count: imported.length, productIds: imported },
      request
    });
    return { imported: imported.length, productIds: imported };
  }).immediate();
}
