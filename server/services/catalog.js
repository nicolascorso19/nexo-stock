import { createId, nowIso } from '../utils.js';
import { notFound, unprocessable } from '../errors.js';
import { optionalText, requiredText } from '../validation.js';

function slug(value) {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 45) || 'sin-nombre';
}

function ensureGenericOption(db, type, value, metadata = {}, sortOrder = 999) {
  const now = nowIso();
  db.prepare(`
    INSERT INTO options (id, option_type, value, label, sort_order, metadata_json, active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
    ON CONFLICT(option_type, value) DO UPDATE SET
      label = excluded.label,
      sort_order = excluded.sort_order,
      metadata_json = excluded.metadata_json,
      active = 1,
      updated_at = excluded.updated_at
  `).run(`option_${type}_${slug(value)}`, type, value, value, sortOrder, JSON.stringify(metadata), now, now);
}

export function findOrCreateBrand(db, rawName) {
  const name = requiredText(rawName, 'La marca', { max: 100 });
  const existing = db.prepare('SELECT id, name, active FROM brands WHERE name = ? COLLATE NOCASE').get(name);
  if (existing) {
    if (!existing.active) db.prepare('UPDATE brands SET active = 1, updated_at = ? WHERE id = ?').run(nowIso(), existing.id);
    return existing;
  }
  const id = createId('brand');
  const now = nowIso();
  db.prepare('INSERT INTO brands (id, name, active, created_at, updated_at) VALUES (?, ?, 1, ?, ?)')
    .run(id, name, now, now);
  ensureGenericOption(db, 'brand', name, { brandId: id });
  return { id, name };
}

export function findOrCreateModel(db, rawBrand, rawModel) {
  const brand = findOrCreateBrand(db, rawBrand);
  const name = requiredText(rawModel, 'El modelo', { max: 140 });
  const existing = db.prepare(`
    SELECT id, name, active FROM product_models
    WHERE brand_id = ? AND name = ? COLLATE NOCASE
  `).get(brand.id, name);
  if (existing) {
    if (!existing.active) db.prepare('UPDATE product_models SET active = 1, updated_at = ? WHERE id = ?').run(nowIso(), existing.id);
    return existing;
  }
  const id = createId('model');
  const now = nowIso();
  db.prepare(`
    INSERT INTO product_models (id, brand_id, name, active, created_at, updated_at)
    VALUES (?, ?, ?, 1, ?, ?)
  `).run(id, brand.id, name, now, now);
  ensureGenericOption(db, 'product_model', name, { brandId: brand.id, modelId: id });
  return { id, name, brandId: brand.id };
}

export function findOrCreateCategory(db, rawName) {
  const name = requiredText(rawName, 'La categoría', { max: 100 });
  const existing = db.prepare('SELECT id, name, active FROM categories WHERE name = ? COLLATE NOCASE').get(name);
  if (existing) {
    if (!existing.active) db.prepare('UPDATE categories SET active = 1, updated_at = ? WHERE id = ?').run(nowIso(), existing.id);
    return existing;
  }
  const id = createId('category');
  const now = nowIso();
  db.prepare('INSERT INTO categories (id, name, active, created_at, updated_at) VALUES (?, ?, 1, ?, ?)')
    .run(id, name, now, now);
  ensureGenericOption(db, 'category', name, { categoryId: id });
  return { id, name };
}

export function findOrCreateCapacity(db, rawName) {
  const name = requiredText(rawName, 'La capacidad', { max: 40 });
  const existing = db.prepare('SELECT id, name, active FROM capacities WHERE name = ? COLLATE NOCASE').get(name);
  if (existing) {
    if (!existing.active) db.prepare('UPDATE capacities SET active = 1, updated_at = ? WHERE id = ?').run(nowIso(), existing.id);
    return existing;
  }
  const id = createId('capacity');
  const now = nowIso();
  db.prepare('INSERT INTO capacities (id, name, sort_order, active, created_at, updated_at) VALUES (?, ?, 999, 1, ?, ?)')
    .run(id, name, now, now);
  ensureGenericOption(db, 'capacity', name, { capacityId: id });
  return { id, name };
}

export function findOrCreateColor(db, rawName) {
  const name = requiredText(rawName, 'El color', { max: 100 });
  const existing = db.prepare('SELECT id, name, active FROM colors WHERE name = ? COLLATE NOCASE').get(name);
  if (existing) {
    if (!existing.active) db.prepare('UPDATE colors SET active = 1, updated_at = ? WHERE id = ?').run(nowIso(), existing.id);
    return existing;
  }
  const id = createId('color');
  const now = nowIso();
  db.prepare('INSERT INTO colors (id, name, sort_order, active, created_at, updated_at) VALUES (?, ?, 999, 1, ?, ?)')
    .run(id, name, now, now);
  ensureGenericOption(db, 'color', name, { colorId: id });
  return { id, name };
}

export function findOrCreateLocation(db, rawName) {
  const name = requiredText(rawName, 'La ubicación', { max: 100 });
  const existing = db.prepare('SELECT id, name, active FROM locations WHERE name = ? COLLATE NOCASE').get(name);
  if (existing) {
    if (!existing.active) db.prepare('UPDATE locations SET active = 1, updated_at = ? WHERE id = ?').run(nowIso(), existing.id);
    return existing;
  }
  const id = createId('location');
  const now = nowIso();
  db.prepare('INSERT INTO locations (id, name, active, created_at, updated_at) VALUES (?, ?, 1, ?, ?)')
    .run(id, name, now, now);
  ensureGenericOption(db, 'location', name, { locationId: id });
  return { id, name };
}

export function requireSupplier(db, supplierId) {
  if (!supplierId) return null;
  const supplier = db.prepare('SELECT id, name, active FROM suppliers WHERE id = ?').get(supplierId);
  if (!supplier) throw unprocessable('El proveedor seleccionado no existe.', 'SUPPLIER_NOT_FOUND');
  if (!supplier.active) throw unprocessable('El proveedor seleccionado está inactivo.', 'SUPPLIER_INACTIVE');
  return supplier;
}

export function requireCustomer(db, customerId) {
  if (!customerId) return null;
  const customer = db.prepare('SELECT id, name, active FROM customers WHERE id = ?').get(customerId);
  if (!customer) throw unprocessable('El cliente seleccionado no existe.', 'CUSTOMER_NOT_FOUND');
  if (!customer.active) throw unprocessable('El cliente seleccionado está inactivo.', 'CUSTOMER_INACTIVE');
  return customer;
}

export function normalizeOptionalLookupName(value, label) {
  const normalized = optionalText(value, label, { max: 100 });
  return normalized || null;
}
