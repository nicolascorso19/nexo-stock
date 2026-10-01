import { parseJson } from '../utils.js';
import { conflict, notFound, unprocessable } from '../errors.js';
import { createId, nowIso } from '../utils.js';
import { recordAudit } from './audit.js';
import {
  findOrCreateBrand,
  findOrCreateCapacity,
  findOrCreateCategory,
  findOrCreateColor,
  findOrCreateLocation,
  findOrCreateModel
} from './catalog.js';
import { nonNegativeInteger, optionalText, requireObject, requiredText } from '../validation.js';

const aliases = {
  paymentmethod: 'payment_method',
  payment_methods: 'payment_method',
  metodo_pago: 'payment_method',
  condition: 'condition',
  condicion: 'condition',
  physicalstate: 'physical_state',
  physical_state: 'physical_state',
  movementtype: 'movement_type',
  movement_type: 'movement_type',
  warrantystatus: 'warranty_status',
  warranty_status: 'warranty_status',
  location: 'location',
  ubicacion: 'location',
  category: 'category',
  categoria: 'category',
  capacity: 'capacity',
  capacidad: 'capacity',
  color: 'color',
  brand: 'brand',
  marca: 'brand',
  model: 'product_model',
  product_model: 'product_model',
  productmodel: 'product_model'
};

const allowedTypes = new Set([
  'payment_method', 'condition', 'physical_state', 'movement_type', 'warranty_status',
  'location', 'category', 'capacity', 'color', 'brand', 'product_model'
]);

function normalizeType(value) {
  const raw = String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  const type = aliases[raw.replace(/_/g, '')] || aliases[raw] || raw;
  if (!allowedTypes.has(type)) throw unprocessable('El tipo de opción no está permitido.', 'INVALID_OPTION_TYPE');
  return type;
}

function mapOption(row) {
  if (!row) return null;
  return {
    id: row.id,
    type: row.option_type,
    value: row.value,
    label: row.label,
    sortOrder: Number(row.sort_order),
    metadata: parseJson(row.metadata_json, {}),
    active: row.active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function optionById(db, id) {
  return mapOption(db.prepare('SELECT * FROM options WHERE id = ?').get(id));
}

function mirrorCatalogOption(db, type, value, payload) {
  switch (type) {
    case 'location': return { ...findOrCreateLocation(db, value), lookup: 'locations' };
    case 'category': return { ...findOrCreateCategory(db, value), lookup: 'categories' };
    case 'capacity': return { ...findOrCreateCapacity(db, value), lookup: 'capacities' };
    case 'color': return { ...findOrCreateColor(db, value), lookup: 'colors' };
    case 'brand': return { ...findOrCreateBrand(db, value), lookup: 'brands' };
    case 'product_model': {
      const brandName = requiredText(payload.brand || payload.brandName, 'La marca del modelo', { max: 100 });
      const brand = findOrCreateBrand(db, brandName);
      const model = findOrCreateModel(db, brand.name, value);
      return { ...model, lookup: 'product_models' };
    }
    default: return { lookup: null };
  }
}

export function createOption(db, payload, user, request) {
  requireObject(payload);
  return db.transaction(() => {
    const type = normalizeType(payload.type || payload.optionType);
    const value = requiredText(payload.value ?? payload.name, 'El valor de la opción', { max: 140 });
    const label = optionalText(payload.label, 'La etiqueta', { max: 140 }) || value;
    const sortOrder = nonNegativeInteger(payload.sortOrder ?? 0, 'El orden', { max: 1_000_000 });
    const mirror = mirrorCatalogOption(db, type, value, payload);
    const metadata = {
      ...(payload.metadata && typeof payload.metadata === 'object' && !Array.isArray(payload.metadata) ? payload.metadata : {}),
      ...(mirror.id ? { [`${mirror.lookup}Id`]: mirror.id } : {})
    };
    const id = createId('option');
    const now = nowIso();
    db.prepare(`
      INSERT INTO options (
        id, option_type, value, label, sort_order, metadata_json, active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
      ON CONFLICT(option_type, value) DO UPDATE SET
        label = excluded.label,
        sort_order = excluded.sort_order,
        metadata_json = excluded.metadata_json,
        active = 1,
        updated_at = excluded.updated_at
    `).run(id, type, value, label, sortOrder, JSON.stringify(metadata), now, now);

    const option = db.prepare('SELECT * FROM options WHERE option_type = ? AND value = ? COLLATE NOCASE').get(type, value);
    if (!option) throw notFound('La opción');
    recordAudit(db, {
      userId: user.id,
      action: 'Opción creada',
      entityType: 'option',
      entityId: option.id,
      after: mapOption(option),
      request
    });
    return mapOption(option);
  }).immediate();
}

export function deleteOption(db, id, user, request) {
  return db.transaction(() => {
    const raw = db.prepare('SELECT * FROM options WHERE id = ?').get(id);
    if (!raw) throw notFound('La opción');
    const option = mapOption(raw);
    if (option.active) {
      const now = nowIso();
      db.prepare('UPDATE options SET active = 0, updated_at = ? WHERE id = ?').run(now, id);
      const metadata = option.metadata || {};
      const lookupTypes = {
        location: 'locations',
        category: 'categories',
        capacity: 'capacities',
        color: 'colors',
        brand: 'brands',
        product_model: 'product_models'
      };
      const table = lookupTypes[option.type];
      const singularTypes = {
        location: 'location', category: 'category', capacity: 'capacity', color: 'color', brand: 'brand', product_model: 'model'
      };
      const lookupId = table
        ? (metadata[`${table}Id`] || metadata[`${singularTypes[option.type]}Id`])
        : null;
      if (lookupId) db.prepare(`UPDATE ${table} SET active = 0, updated_at = ? WHERE id = ?`).run(now, lookupId);
      recordAudit(db, {
        userId: user.id,
        action: 'Opción desactivada',
        entityType: 'option',
        entityId: id,
        before: option,
        after: { ...option, active: false },
        request
      });
    }
    return optionById(db, id);
  }).immediate();
}

export function deleteOptionByValue(db, payload, user, request) {
  requireObject(payload);
  const type = normalizeType(payload.type || payload.optionType);
  const value = requiredText(payload.value, 'El valor de la opción', { max: 140 });
  const option = db.prepare('SELECT id FROM options WHERE option_type = ? AND value = ? COLLATE NOCASE').get(type, value);
  if (!option) throw notFound('La opción');
  return deleteOption(db, option.id, user, request);
}

export { normalizeType };
