import { AppError, unprocessable } from '../errors.js';
import { isPlainObject, isValidImei, normalizeImei, nowIso, sha256 } from '../utils.js';
import { createDatabase } from './database.js';
import { insertBackupLog, recordAudit } from '../services/audit.js';
import { normalizePaymentStatus } from '../services/commerce.js';
import { movementTypeFromLabel, normalizeUnitStatus } from './bootstrap.js';
import { DEFAULT_SETTINGS, saveSetting } from '../services/settings.js';

const requiredArrays = [
  'users', 'suppliers', 'customers', 'products', 'units', 'sales', 'purchases',
  'movements', 'reservations', 'warrantyClaims', 'auditLogs'
];

const domainTables = [
  'settings', 'options', 'locations', 'brands', 'product_models', 'categories',
  'capacities', 'colors', 'suppliers', 'customers', 'products', 'product_variants',
  'inventory', 'purchases', 'purchase_items', 'inventory_units', 'sales', 'sale_items',
  'payments', 'stock_movements', 'sale_returns', 'sale_return_items', 'reservations', 'warranty_claims', 'audit_logs', 'error_logs', 'inventory_reconciliations'
];

const tableColumns = {
  settings: ['key', 'value_json', 'updated_at', 'updated_by'],
  options: ['id', 'option_type', 'value', 'label', 'sort_order', 'metadata_json', 'active', 'created_at', 'updated_at'],
  locations: ['id', 'name', 'active', 'created_at', 'updated_at'],
  brands: ['id', 'name', 'active', 'created_at', 'updated_at'],
  product_models: ['id', 'brand_id', 'name', 'active', 'created_at', 'updated_at'],
  categories: ['id', 'name', 'active', 'created_at', 'updated_at'],
  capacities: ['id', 'name', 'sort_order', 'active', 'created_at', 'updated_at'],
  colors: ['id', 'name', 'sort_order', 'active', 'created_at', 'updated_at'],
  suppliers: ['id', 'name', 'company', 'tax_id', 'phone', 'whatsapp', 'email', 'address', 'notes', 'active', 'created_at', 'updated_at'],
  customers: ['id', 'name', 'first_name', 'last_name', 'tax_id', 'phone', 'whatsapp', 'email', 'address', 'notes', 'active', 'created_at', 'updated_at'],
  products: ['id', 'model_id', 'category_id', 'notes', 'public_slug', 'public_description', 'public_images_json', 'public_highlights_json', 'public_specs_json', 'published', 'is_trending', 'published_at', 'is_fictional', 'archived', 'created_at', 'updated_at'],
  product_variants: ['id', 'product_id', 'capacity_id', 'color_id', 'variant_name', 'sku', 'barcode', 'ram', 'condition', 'physical_state', 'requires_imei', 'cost', 'cost_registered', 'sale_price', 'sale_price_registered', 'promo_price', 'apple_official_price_usd', 'apple_price_source', 'apple_price_updated_at', 'apple_price_updated_by', 'min_stock', 'supplier_id', 'location_id', 'purchase_date', 'warranty', 'notes', 'published', 'public_images_json', 'previous_price', 'promo_starts_at', 'promo_ends_at', 'active', 'is_fictional', 'created_at', 'updated_at'],
  inventory: ['variant_id', 'quantity', 'reserved_quantity', 'updated_at'],
  purchases: ['id', 'supplier_id', 'user_id', 'purchase_date', 'payment_method', 'payment_status', 'subtotal', 'discount', 'total', 'cost_total', 'notes', 'idempotency_key', 'request_hash', 'created_at'],
  purchase_items: ['id', 'purchase_id', 'variant_id', 'quantity', 'unit_cost', 'line_total'],
  inventory_units: ['id', 'variant_id', 'purchase_item_id', 'imei', 'imei_2', 'serial_number', 'unit_status', 'condition', 'physical_state', 'cost', 'cost_registered', 'sale_price', 'sale_price_registered', 'entry_date', 'supplier_id', 'location_id', 'notes', 'is_fictional', 'created_at', 'updated_at'],
  sales: ['id', 'customer_id', 'user_id', 'sale_date', 'payment_method', 'payment_status', 'subtotal', 'discount', 'total', 'cost_total', 'profit_total', 'profit_known', 'status', 'notes', 'idempotency_key', 'request_hash', 'created_at', 'annul_reason', 'annulled_at', 'annulled_by'],
  sale_items: ['id', 'sale_id', 'variant_id', 'inventory_unit_id', 'serialized', 'quantity', 'unit_price', 'discount', 'unit_cost', 'cost_registered', 'line_total'],
  payments: ['id', 'sale_id', 'purchase_id', 'payment_method', 'amount', 'payment_status', 'reference', 'paid_at', 'created_at'],
  stock_movements: ['id', 'variant_id', 'inventory_unit_id', 'user_id', 'movement_type', 'quantity', 'stock_before', 'stock_after', 'cost', 'price', 'reason', 'notes', 'reference_type', 'reference_id', 'created_at'],
  sale_returns: ['id', 'sale_id', 'customer_id', 'user_id', 'return_date', 'reason', 'status', 'created_at'],
  sale_return_items: ['id', 'return_id', 'sale_item_id', 'variant_id', 'inventory_unit_id', 'quantity', 'unit_price', 'unit_cost', 'cost_registered', 'line_total', 'restocked', 'created_at'],
  inventory_reconciliations: ['id', 'variant_id', 'user_id', 'recorded_stock', 'physical_stock', 'difference', 'reason', 'notes', 'created_at'],
  reservations: ['id', 'inventory_unit_id', 'customer_id', 'user_id', 'reserved_at', 'expires_at', 'deposit', 'status', 'notes', 'created_at', 'updated_at'],
  warranty_claims: ['id', 'inventory_unit_id', 'customer_id', 'user_id', 'received_at', 'expires_at', 'reason', 'status', 'notes', 'created_at', 'updated_at'],
  audit_logs: ['id', 'user_id', 'action', 'entity_type', 'entity_id', 'before_value', 'after_value', 'ip_address', 'user_agent', 'created_at'],
  error_logs: ['id', 'user_id', 'level', 'code', 'message', 'entity_type', 'entity_id', 'request_id', 'stack', 'created_at']
};

const userColumns = new Set(['user_id', 'updated_by', 'apple_price_updated_by']);

function invalid(message) {
  return unprocessable(`Backup inválido: ${message}`, 'INVALID_BACKUP');
}

function objectValue(value, label) {
  if (!isPlainObject(value)) throw invalid(`${label} debe ser un objeto.`);
  return value;
}

function arrayValue(value, label, max = 100_000) {
  if (!Array.isArray(value)) throw invalid(`${label} debe ser una lista.`);
  if (value.length > max) throw invalid(`${label} supera el tamaño permitido.`);
  return value;
}

function text(value, label, { required = false, max = 4000 } = {}) {
  if (value === undefined || value === null) {
    if (required) throw invalid(`${label} es obligatorio.`);
    return '';
  }
  const result = String(value).trim();
  if (required && !result) throw invalid(`${label} es obligatorio.`);
  if (result.length > max) throw invalid(`${label} es demasiado largo.`);
  return result;
}

function id(value, label) {
  const result = text(value, label, { required: true, max: 120 });
  if (!/^[A-Za-z0-9._:-]+$/.test(result)) throw invalid(`${label} contiene caracteres no permitidos.`);
  return result;
}

function number(value, label, { min = -Infinity, max = Infinity, integer = false } = {}) {
  const result = Number(value);
  if (!Number.isFinite(result) || result < min || result > max || (integer && !Number.isInteger(result))) {
    throw invalid(`${label} no es un número válido.`);
  }
  return result;
}

function bool(value, fallback = false) {
  if (value === undefined || value === null) return fallback;
  if (value === true || value === 1) return true;
  if (value === false || value === 0) return false;
  throw invalid('Se esperaba un valor booleano.');
}

function date(value, label, fallback = null) {
  if (value === undefined || value === null || value === '') return fallback;
  const result = new Date(value);
  if (Number.isNaN(result.getTime())) throw invalid(`${label} no es una fecha válida.`);
  return result.toISOString();
}

function nullable(value, label, max = 4000) {
  const result = text(value, label, { max });
  return result || null;
}

function rejectCredentials(value, path = 'data', depth = 0) {
  if (!value || typeof value !== 'object') return;
  if (depth > 32) throw invalid(`${path} excede la profundidad permitida.`);
  if (Array.isArray(value)) {
    value.forEach((item, index) => rejectCredentials(item, `${path}[${index}]`, depth + 1));
    return;
  }
  for (const [key, item] of Object.entries(value)) {
    if (/^(password|password_hash|passwordHash|token|sessionToken)$/i.test(key)) {
      throw invalid(`${path}.${key} no está permitido en un backup restaurable.`);
    }
    rejectCredentials(item, `${path}.${key}`, depth + 1);
  }
}

export function validateBackupEnvelope(envelope) {
  objectValue(envelope, 'El backup');
  if (envelope.format && envelope.format !== 'nexo-json-backup') throw invalid('El formato de archivo no es compatible.');
  if (![1, 2, 3].includes(Number(envelope.version))) throw invalid('La versión de backup no es compatible.');
  const data = envelope.data || envelope;
  objectValue(data, 'Los datos del backup');
  if (![1, 2, 3].includes(Number(data.version))) throw invalid('La versión de datos no es compatible.');
  if (data.returns === undefined) data.returns = [];
  if (data.errorLogs === undefined) data.errorLogs = [];
  objectValue(data.settings, 'settings');
  for (const key of requiredArrays) arrayValue(data[key], key, key === 'units' || key === 'auditLogs' ? 250_000 : 100_000);
  rejectCredentials(data);
  return data;
}

function insertStagingSecurity(db, data) {
  const roleRows = [
    ['admin', 'Administrador', ['*']],
    ['seller', 'Vendedor', []],
    ['inventory', 'Inventario', []]
  ];
  const roleInsert = db.prepare(`
    INSERT INTO roles (id, name, permissions_json, active, created_at, updated_at)
    VALUES (?, ?, ?, 1, ?, ?)
  `);
  const now = nowIso();
  for (const role of roleRows) roleInsert.run(role[0], role[1], JSON.stringify(role[2]), now, now);

  const users = arrayValue(data.users, 'users');
  if (!users.length) throw invalid('Debe existir al menos un usuario de referencia.');
  const insert = db.prepare(`
    INSERT INTO users (
      id, role_id, name, email, password_hash, active, last_login_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const fallbackId = 'restore_admin';
  let inserted = 0;
  for (const raw of users) {
    const user = objectValue(raw, 'usuario');
    const userId = id(user.id, 'user.id');
    const roleName = text(user.role, 'user.role', { required: true, max: 60 });
    const role = roleRows.find(item => item[1].toLowerCase() === roleName.toLowerCase() || item[0].toLowerCase() === roleName.toLowerCase());
    if (!role) throw invalid(`Rol de usuario no permitido: ${roleName}.`);
    const email = text(user.email, 'user.email', { required: true, max: 254 }).toLowerCase();
    if (!email.includes('@')) throw invalid('El backup contiene un email de usuario inválido.');
    const created = date(user.createdAt, 'user.createdAt', now);
    insert.run(
      userId,
      role[0],
      text(user.name, 'user.name', { required: true, max: 180 }),
      email,
      '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.',
      bool(user.active, true) ? 1 : 0,
      date(user.lastLogin, 'user.lastLogin'),
      created,
      date(user.updatedAt, 'user.updatedAt', created)
    );
    inserted += 1;
  }
  if (!inserted) {
    insert.run(fallbackId, 'admin', 'Restore Admin', 'restore-admin@invalid.local', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.', 1, null, now, now);
  }
}

function insertStagingSettings(db, settings) {
  const normalized = { ...DEFAULT_SETTINGS };
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    if (settings[key] !== undefined) normalized[key] = settings[key];
  }
  normalized.currency = 'USD';
  normalized.locationName = text(normalized.locationName || 'Córdoba Capital', 'settings.locationName', { required: true, max: 120 });
  normalized.valuationMethod = 'AVERAGE';
  normalized.allowNegativeStock = false;
  normalized.minMargin = number(normalized.minMargin, 'settings.minMargin', { min: 0, max: 1000 });
  normalized.defaultMinStock = number(normalized.defaultMinStock, 'settings.defaultMinStock', { min: 0, max: 10_000_000, integer: true });
  normalized.lastUnitThreshold = number(normalized.lastUnitThreshold ?? 1, 'settings.lastUnitThreshold', { min: 0, max: 10_000_000, integer: true });
  normalized.taxRate = number(normalized.taxRate, 'settings.taxRate', { min: 0, max: 100 });
  normalized.allowNegativeStock = bool(normalized.allowNegativeStock, false);
  normalized.lowStockNotifications = bool(normalized.lowStockNotifications, true);
  for (const [key, value] of Object.entries(normalized)) saveSetting(db, key, value, null, nowIso());
}

function ensureLookup(db, type, rawName, rawId = null) {
  const name = text(rawName, `${type}.name`, { required: true, max: 140 });
  let row = db.prepare(`SELECT * FROM ${type} WHERE name = ? COLLATE NOCASE`).get(name);
  if (row) return row;
  const idValue = rawId && /^[A-Za-z0-9._:-]+$/.test(String(rawId)) ? String(rawId) : `restore_${type}_${sha256(name).slice(0, 16)}`;
  const now = nowIso();
  if (type === 'capacities' || type === 'colors') {
    db.prepare(`INSERT INTO ${type} (id, name, sort_order, active, created_at, updated_at) VALUES (?, ?, 999, 1, ?, ?)`)
      .run(idValue, name, now, now);
  } else {
    db.prepare(`INSERT INTO ${type} (id, name, active, created_at, updated_at) VALUES (?, ?, 1, ?, ?)`)
      .run(idValue, name, now, now);
  }
  return db.prepare(`SELECT * FROM ${type} WHERE id = ?`).get(idValue);
}

function insertOption(db, type, value, label, metadata, sortOrder) {
  const optionId = `restore_option_${sha256(`${type}:${value}`).slice(0, 24)}`;
  db.prepare(`
    INSERT INTO options (id, option_type, value, label, sort_order, metadata_json, active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
    ON CONFLICT(option_type, value) DO UPDATE SET
      label = excluded.label,
      sort_order = excluded.sort_order,
      metadata_json = excluded.metadata_json,
      active = 1,
      updated_at = excluded.updated_at
  `).run(optionId, type, value, label, sortOrder, JSON.stringify(metadata), nowIso(), nowIso());
  return db.prepare('SELECT * FROM options WHERE option_type = ? AND value = ? COLLATE NOCASE').get(type, value);
}

function insertStagingOptions(db, data) {
  const lists = {
    brand: arrayValue(data.brands, 'brands', 10_000),
    category: arrayValue(data.categories, 'categories', 10_000),
    location: arrayValue(data.locations, 'locations', 10_000),
    capacity: arrayValue(data.capacities, 'capacities', 10_000),
    color: arrayValue(data.colors, 'colors', 10_000),
    payment_method: arrayValue(data.paymentMethods, 'paymentMethods', 10_000)
  };
  const lookupTables = {
    brand: 'brands', category: 'categories', location: 'locations', capacity: 'capacities', color: 'colors'
  };
  for (const [type, values] of Object.entries(lists)) {
    values.forEach((value, index) => {
      const normalized = text(value, `options.${type}`, { required: true, max: 140 });
      if (lookupTables[type]) ensureLookup(db, lookupTables[type], normalized);
      insertOption(db, type, normalized, value, {}, index);
    });
  }
  for (const type of ['condition', 'physical_state', 'movement_type', 'warranty_status']) {
    const names = {
      condition: ['Nuevo', 'Usado', 'Reacondicionado', 'Exhibición', 'Reparado'],
      physical_state: ['10/10', '9/10', '8/10', '7/10', 'Otro'],
      movement_type: ['Entrada', 'Venta', 'Salida manual', 'Devolución', 'Ajuste', 'Transferencia', 'Pérdida', 'Reparación'],
      warranty_status: ['En garantía', 'Fuera de garantía', 'En revisión', 'Resuelto']
    }[type];
    names.forEach((name, index) => insertOption(db, type, name, name, {}, index));
  }
  const allowedOptions = new Set([
    'payment_method', 'condition', 'physical_state', 'movement_type', 'warranty_status',
    'location', 'category', 'capacity', 'color', 'brand', 'product_model'
  ]);
  for (const raw of arrayValue(data.options || [], 'options', 100_000)) {
    const option = objectValue(raw, 'option');
    const type = text(option.type, 'option.type', { required: true, max: 60 });
    if (!allowedOptions.has(type)) throw invalid(`Tipo de opción no permitido: ${type}.`);
    const metadata = option.metadata && isPlainObject(option.metadata) ? option.metadata : {};
    const restoredOption = insertOption(
      db,
      type,
      text(option.value, 'option.value', { required: true, max: 140 }),
      text(option.label || option.value, 'option.label', { required: true, max: 140 }),
      metadata,
      number(option.sortOrder ?? 0, 'option.sortOrder', { min: 0, max: 1_000_000, integer: true })
    );
    db.prepare('UPDATE options SET active = ?, created_at = ?, updated_at = ? WHERE id = ?')
      .run(bool(option.active, true) ? 1 : 0, date(option.createdAt, 'option.createdAt', nowIso()), date(option.updatedAt, 'option.updatedAt', nowIso()), restoredOption.id);
  }
  const brands = db.prepare('SELECT id, name FROM brands').all();
  for (const raw of arrayValue(data.models || [], 'models', 10_000)) {
    const model = typeof raw === 'string' ? { name: raw } : objectValue(raw, 'model');
    const name = text(model.name, 'model.name', { required: true, max: 140 });
    const brandName = model.brand ? String(model.brand) : 'Apple';
    const brand = brands.find(item => item.name.toLowerCase() === brandName.toLowerCase()) || ensureLookup(db, 'brands', brandName);
    const modelId = `restore_model_${sha256(`${brand.id}:${name}`).slice(0, 20)}`;
    db.prepare('INSERT INTO product_models (id, brand_id, name, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(modelId, brand.id, name, model.active === false ? 0 : 1, nowIso(), nowIso());
    insertOption(db, 'product_model', name, name, { brandId: brand.id, modelId }, 0);
  }
}

function insertStagingContacts(db, data) {
  const supplierInsert = db.prepare(`
    INSERT INTO suppliers (id, name, company, tax_id, phone, whatsapp, email, address, notes, active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const raw of arrayValue(data.suppliers, 'suppliers', 100_000)) {
    const row = objectValue(raw, 'supplier');
    const created = date(row.createdAt, 'supplier.createdAt', nowIso());
    supplierInsert.run(
      id(row.id, 'supplier.id'), text(row.name, 'supplier.name', { required: true, max: 180 }),
      nullable(row.company, 'supplier.company', 180), nullable(row.taxId, 'supplier.taxId', 80),
      nullable(row.phone, 'supplier.phone', 80), nullable(row.whatsapp, 'supplier.whatsapp', 80),
      nullable(row.email, 'supplier.email', 254), nullable(row.address, 'supplier.address', 300),
      nullable(row.notes, 'supplier.notes'), bool(row.active, true) ? 1 : 0, created, date(row.updatedAt, 'supplier.updatedAt', created)
    );
  }
  const customerInsert = db.prepare(`
    INSERT INTO customers (id, name, first_name, last_name, tax_id, phone, whatsapp, email, address, notes, active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const raw of arrayValue(data.customers, 'customers', 100_000)) {
    const row = objectValue(raw, 'customer');
    const created = date(row.createdAt, 'customer.createdAt', nowIso());
    customerInsert.run(
      id(row.id, 'customer.id'), text(row.name, 'customer.name', { required: true, max: 180 }),
      nullable(row.firstName, 'customer.firstName', 100), nullable(row.lastName, 'customer.lastName', 100),
      nullable(row.taxId, 'customer.taxId', 80), nullable(row.phone, 'customer.phone', 80),
      nullable(row.whatsapp, 'customer.whatsapp', 80), nullable(row.email, 'customer.email', 254),
      nullable(row.address, 'customer.address', 300), nullable(row.notes, 'customer.notes'),
      bool(row.active, true) ? 1 : 0, created, date(row.updatedAt, 'customer.updatedAt', created)
    );
  }
}

function insertStagingProducts(db, data) {
  const products = arrayValue(data.products, 'products', 100_000);
  const productStatement = db.prepare(`
    INSERT INTO products (
      id, model_id, category_id, notes, public_slug, public_description,
      public_images_json, public_highlights_json, public_specs_json,
      published, is_trending, published_at, is_fictional, archived, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const variantStatement = db.prepare(`
    INSERT INTO product_variants (
      id, product_id, capacity_id, color_id, variant_name, sku, barcode, ram,
      condition, physical_state, requires_imei, cost, cost_registered, sale_price, sale_price_registered,
      promo_price, apple_official_price_usd, apple_price_source, apple_price_updated_at, apple_price_updated_by, min_stock, supplier_id, location_id,
      purchase_date, warranty, notes, published, public_images_json, previous_price, promo_starts_at,
      promo_ends_at, active, is_fictional, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const productDefinitions = new Map();
  for (const raw of products) {
    const row = objectValue(raw, 'product');
    const variantId = id(row.id, 'product.id');
    const productId = id(row.productId || `restore_product_${variantId}`, 'product.productId');
    const brand = ensureLookup(db, 'brands', row.brand);
    const modelName = text(row.model, 'product.model', { required: true, max: 140 });
    let model = db.prepare('SELECT * FROM product_models WHERE brand_id = ? AND name = ? COLLATE NOCASE').get(brand.id, modelName);
    if (!model) {
      const modelId = `restore_model_${sha256(`${brand.id}:${modelName}`).slice(0, 20)}`;
      db.prepare('INSERT INTO product_models (id, brand_id, name, active, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)')
        .run(modelId, brand.id, modelName, nowIso(), nowIso());
      model = db.prepare('SELECT * FROM product_models WHERE id = ?').get(modelId);
      insertOption(db, 'product_model', modelName, modelName, { brandId: brand.id, modelId }, 0);
    }
    const category = ensureLookup(db, 'categories', row.category || 'Otros');
    const capacity = row.capacity ? ensureLookup(db, 'capacities', row.capacity) : null;
    const color = row.color ? ensureLookup(db, 'colors', row.color) : null;
    const location = ensureLookup(db, 'locations', row.location || 'Local');
    const supplierId = text(row.supplierId, 'product.supplierId', { max: 120 });
    if (supplierId && !db.prepare('SELECT 1 FROM suppliers WHERE id = ?').get(supplierId)) {
      throw invalid(`El producto ${variantId} referencia un proveedor inexistente.`);
    }
    const cost = row.cost === null || row.cost === undefined ? 0 : number(row.cost, 'product.cost', { min: 0, max: 1_000_000_000_000 });
    const price = row.price === null || row.price === undefined ? 0 : number(row.price, 'product.price', { min: 0.000001, max: 1_000_000_000_000 });
    const costKnown = row.costKnown === true || row.costRegistered === 1 || (row.cost !== null && row.cost !== undefined && Number(row.cost) > 0);
    const priceKnown = row.salePriceKnown === true || row.salePriceRegistered === 1 || (row.price !== null && row.price !== undefined && Number(row.price) > 0);
    const minimumMargin = number(data.settings.minMargin ?? 0, 'settings.minMargin', { min: 0, max: 1000 });
    if (priceKnown && costKnown && price > 0 && ((price - cost) / price) * 100 + 0.000001 < minimumMargin) {
      throw invalid(`El producto ${variantId} no cumple el margen mínimo configurado.`);
    }
    const promo = row.promoPrice === null || row.promoPrice === undefined || Number(row.promoPrice) === 0
      ? null
      : number(row.promoPrice, 'product.promoPrice', { min: 0.000001, max: 1_000_000_000_000 });
    if (promo !== null && promo > price) throw invalid(`El producto ${variantId} tiene un precio promocional inválido.`);
    const created = date(row.createdAt, 'product.createdAt', nowIso());
    const updated = date(row.updatedAt, 'product.updatedAt', created);
    const archived = row.status === 'Archivado' ? 1 : 0;
    const definition = productDefinitions.get(productId);
    if (definition && (definition.modelId !== model.id || definition.categoryId !== category.id)) {
      throw invalid(`Las variantes del producto ${productId} tienen modelos o categorías incompatibles.`);
    }
    if (!definition) {
      productStatement.run(
        productId, model.id, category.id, nullable(row.notes, 'product.notes'),
        nullable(row.publicSlug, 'product.publicSlug', 180), nullable(row.publicDescription, 'product.publicDescription', 5000),
        JSON.stringify(Array.isArray(row.publicImages) ? row.publicImages : []),
        JSON.stringify(Array.isArray(row.publicHighlights) ? row.publicHighlights : []),
        JSON.stringify(row.publicSpecifications && typeof row.publicSpecifications === 'object' && !Array.isArray(row.publicSpecifications) ? row.publicSpecifications : {}),
        bool(row.published, false) ? 1 : 0, bool(row.isTrending, false) ? 1 : 0,
        nullable(row.publishedAt, 'product.publishedAt', 40), bool(row.isFictional, false) ? 1 : 0,
        archived, created, updated
      );
      productDefinitions.set(productId, { modelId: model.id, categoryId: category.id });
    }
    const variantName = text(row.variant || `${row.capacity || ''}${row.capacity && row.color ? ' · ' : ''}${row.color || ''}`, 'product.variant', { required: true, max: 180 });
    variantStatement.run(
      variantId, productId, capacity?.id || null, color?.id || null, variantName,
      text(row.sku, 'product.sku', { required: true, max: 80 }), nullable(row.barcode, 'product.barcode', 120),
      nullable(row.ram, 'product.ram', 40), text(row.condition || 'Nuevo', 'product.condition', { max: 60 }),
      text(row.physicalState || '10/10', 'product.physicalState', { max: 60 }), bool(row.requiresImei, true) ? 1 : 0,
      cost, costKnown ? 1 : 0, price, priceKnown ? 1 : 0, promo,
      row.appleOfficialPriceUsd === null || row.appleOfficialPriceUsd === undefined ? null : number(row.appleOfficialPriceUsd, 'product.appleOfficialPriceUsd', { min: 0, max: 1_000_000_000_000 }),
      nullable(row.applePriceSource, 'product.applePriceSource', 180), nullable(row.applePriceUpdatedAt, 'product.applePriceUpdatedAt', 40),
      row.applePriceUpdatedBy ? id(row.applePriceUpdatedBy, 'product.applePriceUpdatedBy') : null, number(row.minStock ?? 0, 'product.minStock', { min: 0, max: 10_000_000, integer: true }),
      supplierId || null, location.id, nullable(row.purchaseDate, 'product.purchaseDate', 10), nullable(row.warranty, 'product.warranty', 120),
      nullable(row.notes, 'product.notes'),
      bool(row.variantPublished ?? row.published, false) ? 1 : 0,
      JSON.stringify(Array.isArray(row.variantImages) ? row.variantImages : []),
      row.previousPrice === null || row.previousPrice === undefined ? null : number(row.previousPrice, 'product.previousPrice', { min: 0.000001, max: 1_000_000_000_000 }),
      nullable(row.promoStartsAt, 'product.promoStartsAt', 40), nullable(row.promoEndsAt, 'product.promoEndsAt', 40),
      archived ? 0 : 1, bool(row.isFictional, false) ? 1 : 0, created, updated
    );
    const stock = number(row.stock, 'product.stock', { min: 0, max: 100_000_000, integer: true });
    const reserved = number(row.reservedStock ?? 0, 'product.reservedStock', { min: 0, max: 100_000_000, integer: true });
    if (reserved > stock) throw invalid(`El producto ${variantId} tiene más unidades reservadas que stock.`);
    db.prepare('INSERT INTO inventory (variant_id, quantity, reserved_quantity, updated_at) VALUES (?, ?, ?, ?)')
      .run(variantId, stock, reserved, updated);
  }
}

function insertPurchasesAndUnits(db, data) {
  const purchaseItems = [];
  const purchaseInsert = db.prepare(`
    INSERT INTO purchases (
      id, supplier_id, user_id, purchase_date, payment_method, payment_status,
      subtotal, discount, total, cost_total, notes, idempotency_key, request_hash, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)
  `);
  const itemInsert = db.prepare(`
    INSERT INTO purchase_items (id, purchase_id, variant_id, quantity, unit_cost, line_total)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const purchases = arrayValue(data.purchases, 'purchases', 100_000);
  for (const raw of purchases) {
    const row = objectValue(raw, 'purchase');
    const purchaseId = id(row.id, 'purchase.id');
    const supplierId = id(row.supplierId, 'purchase.supplierId');
    if (!db.prepare('SELECT 1 FROM suppliers WHERE id = ?').get(supplierId)) throw invalid(`La compra ${purchaseId} referencia un proveedor inexistente.`);
    const userId = id(row.userId, 'purchase.userId');
    if (!db.prepare('SELECT 1 FROM users WHERE id = ?').get(userId)) throw invalid(`La compra ${purchaseId} referencia un usuario inexistente.`);
    const rawItems = arrayValue(row.items, 'purchase.items', 100_000);
    let subtotal = 0;
    const prepared = [];
    for (const rawItem of rawItems) {
      const item = objectValue(rawItem, 'purchaseItem');
      const itemId = id(item.id, 'purchaseItem.id');
      const variantId = id(item.productId, 'purchaseItem.productId');
      if (!db.prepare('SELECT 1 FROM product_variants WHERE id = ?').get(variantId)) throw invalid(`La compra ${purchaseId} referencia un producto inexistente.`);
      const quantity = number(item.quantity, 'purchaseItem.quantity', { min: 1, max: 100_000, integer: true });
      const unitCost = number(item.unitCost, 'purchaseItem.unitCost', { min: 0, max: 1_000_000_000_000 });
      const line = quantity * unitCost;
      subtotal += line;
      prepared.push({ itemId, variantId, quantity, unitCost, line, imeis: arrayValue(item.imeis || [], 'purchaseItem.imeis', 100_000) });
    }
    const total = number(row.total, 'purchase.total', { min: 0, max: 1_000_000_000_000 });
    const discount = subtotal - total;
    if (discount < -0.01 || discount > subtotal) throw invalid(`Los totales de la compra ${purchaseId} no coinciden.`);
    const created = date(row.createdAt, 'purchase.createdAt', nowIso());
    purchaseInsert.run(
      purchaseId, supplierId, userId, date(row.date, 'purchase.date', created), text(row.paymentMethod, 'purchase.paymentMethod', { required: true, max: 100 }),
      normalizePaymentStatus(row.paymentStatus), subtotal, discount, total, subtotal, nullable(row.notes, 'purchase.notes'), nullable(row.idempotencyKey, 'purchase.idempotencyKey', 128), text(row.requestHash, 'purchase.requestHash', { max: 128 }) || sha256(`purchase:${purchaseId}`), created
    );
    for (const item of prepared) {
      itemInsert.run(item.itemId, purchaseId, item.variantId, item.quantity, item.unitCost, item.line);
      purchaseItems.push({ ...item, purchaseId });
    }
  }

  const units = arrayValue(data.units, 'units', 250_000);
  const targetStatuses = new Map();
  const unitInsert = db.prepare(`
    INSERT INTO inventory_units (
      id, variant_id, purchase_item_id, imei, imei_2, serial_number, unit_status,
      condition, physical_state, cost, cost_registered, sale_price, sale_price_registered,
      entry_date, supplier_id, location_id, notes, is_fictional, created_at, updated_at
    ) VALUES (?, ?, NULL, ?, ?, ?, 'AVAILABLE', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const raw of units) {
    const row = objectValue(raw, 'unit');
    const unitId = id(row.id, 'unit.id');
    const variantId = id(row.productId, 'unit.productId');
    const variant = db.prepare('SELECT * FROM product_variants WHERE id = ?').get(variantId);
    if (!variant) throw invalid(`La unidad ${unitId} referencia un producto inexistente.`);
    const imei = normalizeImei(text(row.imei, 'unit.imei', { max: 30 }));
    const imei2 = normalizeImei(text(row.imei2, 'unit.imei2', { max: 30 }));
    if (variant.requires_imei === 1 && !isValidImei(imei)) throw invalid(`La unidad ${unitId} no tiene un IMEI válido.`);
    if (imei2 && !isValidImei(imei2)) throw invalid(`La unidad ${unitId} no tiene un IMEI secundario válido.`);
    if (variant.requires_imei === 0 && (imei || imei2)) throw invalid(`La unidad ${unitId} no puede tener IMEI.`);
    const status = normalizeUnitStatus(row.status);
    if (!['AVAILABLE', 'RESERVED', 'SOLD', 'REPAIR', 'RETURNED', 'LOST', 'RETIRED'].includes(status)) throw invalid(`Estado inválido para la unidad ${unitId}.`);
    targetStatuses.set(unitId, status);
    const supplierId = text(row.supplierId, 'unit.supplierId', { max: 120 });
    if (supplierId && !db.prepare('SELECT 1 FROM suppliers WHERE id = ?').get(supplierId)) throw invalid(`La unidad ${unitId} referencia un proveedor inexistente.`);
    const location = row.location ? ensureLookup(db, 'locations', row.location) : null;
    const created = date(row.createdAt, 'unit.createdAt', nowIso());
    const cost = number(row.cost, 'unit.cost', { min: 0, max: 1_000_000_000_000 });
    const costKnown = row.costKnown === true || row.costRegistered === 1 || cost > 0;
    const salePrice = row.salePrice === null || row.salePrice === undefined || Number(row.salePrice) === 0
      ? 0
      : number(row.salePrice, 'unit.salePrice', { min: 0.000001, max: 1_000_000_000_000 });
    const salePriceKnown = row.salePriceKnown === true || row.salePriceRegistered === 1 || salePrice > 0;
    unitInsert.run(
      unitId, variantId, imei || null, imei2 || null, nullable(row.serialNumber, 'unit.serialNumber', 120),
      nullable(row.condition, 'unit.condition', 60), nullable(row.physicalState, 'unit.physicalState', 60),
      cost, costKnown ? 1 : 0, salePrice, salePriceKnown ? 1 : 0,
      text(row.entryDate, 'unit.entryDate', { required: true, max: 40 }).slice(0, 10), supplierId || null, location?.id || null,
      nullable(row.notes, 'unit.notes'), bool(row.isFictional, false) ? 1 : 0, created, date(row.updatedAt, 'unit.updatedAt', created)
    );
  }

  const updateUnit = db.prepare('UPDATE inventory_units SET purchase_item_id = ? WHERE id = ?');
  for (const item of purchaseItems) {
    for (const rawImei of item.imeis) {
      const imei = normalizeImei(rawImei);
      const unit = db.prepare('SELECT id FROM inventory_units WHERE imei = ? COLLATE NOCASE AND variant_id = ?').get(imei, item.variantId);
      if (!unit) throw invalid(`El IMEI ${imei} de la compra no coincide con una unidad restaurable.`);
      const update = updateUnit.run(item.itemId, unit.id);
      if (update.changes !== 1) throw invalid('No se pudo vincular una unidad con su ítem de compra.');
    }
  }
  return targetStatuses;
}

function applyTargetUnitStatuses(db, targetStatuses) {
  const update = db.prepare('UPDATE inventory_units SET unit_status = ? WHERE id = ? AND unit_status <> ?');
  for (const [unitId, status] of targetStatuses) update.run(status, unitId, status);
}

function insertSales(db, data) {
  const saleInsert = db.prepare(`
    INSERT INTO sales (
      id, customer_id, user_id, sale_date, payment_method, payment_status,
      subtotal, discount, total, cost_total, profit_total, profit_known, status, notes,
      idempotency_key, request_hash, created_at, annul_reason, annulled_at, annulled_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const itemInsert = db.prepare(`
    INSERT INTO sale_items (
      id, sale_id, variant_id, inventory_unit_id, serialized, quantity,
      unit_price, discount, unit_cost, cost_registered, line_total
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const raw of arrayValue(data.sales, 'sales', 100_000)) {
    const row = objectValue(raw, 'sale');
    const saleId = id(row.id, 'sale.id');
    const customerId = text(row.customerId, 'sale.customerId', { max: 120 });
    if (customerId && !db.prepare('SELECT 1 FROM customers WHERE id = ?').get(customerId)) throw invalid(`La venta ${saleId} referencia un cliente inexistente.`);
    const userId = id(row.userId, 'sale.userId');
    if (!db.prepare('SELECT 1 FROM users WHERE id = ?').get(userId)) throw invalid(`La venta ${saleId} referencia un usuario inexistente.`);
    let subtotal = 0;
    let costTotal = 0;
    const prepared = [];
    for (const rawItem of arrayValue(row.items, 'sale.items', 100_000)) {
      const item = objectValue(rawItem, 'saleItem');
      const itemId = id(item.id, 'saleItem.id');
      const variantId = id(item.productId, 'saleItem.productId');
      const variant = db.prepare('SELECT * FROM product_variants WHERE id = ?').get(variantId);
      if (!variant) throw invalid(`La venta ${saleId} referencia un producto inexistente.`);
      const quantity = number(item.quantity, 'saleItem.quantity', { min: 1, max: 100_000, integer: true });
      const price = number(item.price, 'saleItem.price', { min: 0.000001, max: 1_000_000_000_000 });
      const discount = number(item.discount ?? 0, 'saleItem.discount', { min: 0, max: 1_000_000_000_000 });
      const total = number(item.total, 'saleItem.total', { min: 0, max: 1_000_000_000_000 });
      const unitCost = item.cost === null || item.cost === undefined ? 0 : number(item.cost, 'saleItem.cost', { min: 0, max: 1_000_000_000_000 });
      const costKnown = item.costKnown === true || item.costRegistered === 1 || (item.cost !== null && item.cost !== undefined && Number(item.cost) > 0);
      if (Math.abs(total - (quantity * price - discount)) > 0.011) throw invalid(`Los totales del ítem ${itemId} no coinciden.`);
      const unitId = text(item.unitId, 'saleItem.unitId', { max: 120 });
      if (variant.requires_imei === 1 && (quantity !== 1 || !unitId)) throw invalid(`El ítem ${itemId} no cumple la regla de venta serializada.`);
      if (variant.requires_imei === 0 && unitId) throw invalid(`El ítem ${itemId} no puede tener una unidad serializada.`);
      if (unitId) {
        const unit = db.prepare('SELECT * FROM inventory_units WHERE id = ?').get(unitId);
        if (!unit || unit.variant_id !== variantId) throw invalid(`La unidad ${unitId} no coincide con el producto vendido.`);
      }
      // El bootstrap persiste el subtotal neto de líneas; el descuento de
      // cabecera se valida contra ese importe.
      subtotal += total;
      if (costKnown) costTotal += unitCost * quantity;
      prepared.push({ itemId, variantId, quantity, price, discount, total, unitCost, costKnown, unitId });
    }
    const total = number(row.total, 'sale.total', { min: 0.000001, max: 1_000_000_000_000 });
    const discount = subtotal - total;
    if (discount < -0.011 || discount > subtotal + 0.011) throw invalid(`Los totales de la venta ${saleId} no coinciden.`);
    const created = date(row.createdAt, 'sale.createdAt', nowIso());
    const profitKnown = prepared.every(item => item.costKnown);
    const status = ['ANULADA', 'ANNULLED'].includes(String(row.status || '').toUpperCase()) ? 'ANNULLED' : 'ACTIVE';
    saleInsert.run(
      saleId, customerId || null, userId, date(row.date, 'sale.date', created), text(row.paymentMethod, 'sale.paymentMethod', { required: true, max: 100 }),
      status === 'ANNULLED' ? 'REFUNDED' : normalizePaymentStatus(row.paymentStatus), subtotal, discount, total,
      costTotal, profitKnown ? total - costTotal : 0, profitKnown ? 1 : 0, status, nullable(row.notes, 'sale.notes'),
      nullable(row.idempotencyKey, 'sale.idempotencyKey', 128), text(row.requestHash, 'sale.requestHash', { max: 128 }) || sha256(`sale:${saleId}`), created,
      nullable(row.annulReason, 'sale.annulReason', 500), nullable(row.annulledAt, 'sale.annulledAt'), nullable(row.annulledBy, 'sale.annulledBy')
    );
    for (const item of prepared) {
      const serialized = item.unitId ? 1 : 0;
      itemInsert.run(
        item.itemId, saleId, item.variantId, item.unitId || null, serialized, item.quantity,
        item.price, item.discount, item.unitCost, item.costKnown ? 1 : 0, item.total
      );
      if (item.unitId && status === 'ACTIVE') {
        const unit = db.prepare('SELECT unit_status FROM inventory_units WHERE id = ?').get(item.unitId);
        if (unit?.unit_status !== 'AVAILABLE') throw invalid(`La unidad vendida ${item.unitId} ya no está disponible para validar la venta.`);
        db.prepare("UPDATE inventory_units SET unit_status = 'SOLD' WHERE id = ?").run(item.unitId);
      }
    }
  }
}

function insertReturns(db, data) {
  for (const raw of arrayValue(data.returns || [], 'returns', 100_000)) {
    const row = objectValue(raw, 'return');
    const returnId = id(row.id, 'return.id');
    const saleId = id(row.saleId, 'return.saleId');
    if (!db.prepare('SELECT 1 FROM sales WHERE id = ?').get(saleId)) throw invalid(`La devolución ${returnId} referencia una venta inexistente.`);
    const customerId = nullable(row.customerId, 'return.customerId');
    if (customerId && !db.prepare('SELECT 1 FROM customers WHERE id = ?').get(customerId)) throw invalid(`La devolución ${returnId} referencia un cliente inexistente.`);
    const systemUserId = db.prepare('SELECT id FROM users ORDER BY created_at, id LIMIT 1').get().id;
    db.prepare(`INSERT INTO sale_returns (id, sale_id, customer_id, user_id, return_date, reason, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(returnId, saleId, customerId, systemUserId, date(row.date, 'return.date', nowIso()), text(row.reason, 'return.reason', { required: true, max: 1000 }), row.status === 'Parcial' ? 'PARTIAL' : 'COMPLETED', date(row.createdAt, 'return.createdAt', nowIso()));
    const seenItems = new Set();
    for (const rawItem of arrayValue(row.items, 'return.items', 100_000)) {
      const item = objectValue(rawItem, 'returnItem');
      const itemId = id(item.id, 'returnItem.id');
      const saleItemId = id(item.saleItemId, 'returnItem.saleItemId');
      if (seenItems.has(saleItemId)) throw invalid(`La devolución ${returnId} repite la línea de venta ${saleItemId}.`);
      seenItems.add(saleItemId);
      const saleItem = db.prepare('SELECT * FROM sale_items WHERE id = ? AND sale_id = ?').get(saleItemId, saleId);
      if (!saleItem) throw invalid(`La devolución ${returnId} referencia una línea de venta inexistente.`);
      const quantity = number(item.quantity, 'returnItem.quantity', { min: 1, max: 100_000, integer: true });
      const alreadyReturned = Number(db.prepare('SELECT COALESCE(SUM(quantity), 0) AS quantity FROM sale_return_items WHERE sale_item_id = ?').get(saleItemId).quantity);
      if (alreadyReturned + quantity > saleItem.quantity) throw invalid(`La devolución ${returnId} devuelve más unidades de las vendidas.`);
      const unitPrice = number(item.price, 'returnItem.price', { min: 0.000001, max: 1_000_000_000_000 });
      const unitCost = item.cost === null || item.cost === undefined ? 0 : number(item.cost, 'returnItem.cost', { min: 0, max: 1_000_000_000_000 });
      const restocked = bool(item.restocked, true) ? 1 : 0;
      const lineTotal = item.total === undefined || item.total === null ? quantity * unitPrice : number(item.total, 'returnItem.total', { min: 0, max: 1_000_000_000_000 });
      if (Math.abs(lineTotal - quantity * unitPrice) > 0.011) throw invalid(`El importe de la devolución ${itemId} no coincide.`);
      const unitId = nullable(item.unitId, 'returnItem.unitId') || saleItem.inventory_unit_id;
      if (saleItem.inventory_unit_id && unitId !== saleItem.inventory_unit_id) throw invalid(`La unidad devuelta no coincide con la línea ${saleItemId}.`);
      db.prepare(`INSERT INTO sale_return_items (id, return_id, sale_item_id, variant_id, inventory_unit_id, quantity, unit_price, unit_cost, cost_registered, line_total, restocked, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(itemId, returnId, saleItemId, saleItem.variant_id, unitId, quantity, unitPrice, unitCost, item.costKnown ? 1 : 0, lineTotal, restocked, nowIso());
    }
  }
}

function insertErrorLogs(db, data) {
  for (const raw of arrayValue(data.errorLogs || [], 'errorLogs', 250_000)) {
    const row = objectValue(raw, 'errorLog');
    const errorId = id(row.id, 'errorLog.id');
    const level = ['WARN', 'ERROR', 'FATAL'].includes(String(row.level || 'ERROR').toUpperCase()) ? String(row.level).toUpperCase() : 'ERROR';
    db.prepare(`INSERT INTO error_logs (id, user_id, level, code, message, entity_type, entity_id, request_id, stack, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(errorId, nullable(row.userId, 'errorLog.userId'), level, nullable(row.code, 'errorLog.code', 120), text(row.message, 'errorLog.message', { required: true, max: 4000 }), nullable(row.entityType, 'errorLog.entityType', 120), nullable(row.entityId, 'errorLog.entityId', 120), nullable(row.requestId, 'errorLog.requestId', 120), null, date(row.createdAt, 'errorLog.createdAt', nowIso()));
  }
}

function insertPayments(db, data) {
  let index = 0;
  const insert = db.prepare(`
    INSERT INTO payments (
      id, sale_id, purchase_id, payment_method, amount, payment_status,
      reference, paid_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)
  `);
  for (const raw of arrayValue(data.sales, 'sales', 100_000)) {
    const row = objectValue(raw, 'sale');
    const status = normalizePaymentStatus(row.paymentStatus);
    const created = date(row.createdAt, 'sale.createdAt', nowIso());
    insert.run(`restore_payment_sale_${index++}`, id(row.id, 'sale.id'), null, text(row.paymentMethod, 'sale.paymentMethod', { required: true, max: 100 }), number(row.total, 'sale.total', { min: 0 }), status, status === 'PAID' ? date(row.date, 'sale.date', created) : null, created);
  }
  for (const raw of arrayValue(data.purchases, 'purchases', 100_000)) {
    const row = objectValue(raw, 'purchase');
    const status = normalizePaymentStatus(row.paymentStatus);
    const created = date(row.createdAt, 'purchase.createdAt', nowIso());
    insert.run(`restore_payment_purchase_${index++}`, null, id(row.id, 'purchase.id'), text(row.paymentMethod, 'purchase.paymentMethod', { required: true, max: 100 }), number(row.total, 'purchase.total', { min: 0 }), status, status === 'PAID' ? date(row.date, 'purchase.date', created) : null, created);
  }
}

function insertMovementsReservationsAndClaims(db, data) {
  const systemUserId = db.prepare('SELECT id FROM users ORDER BY created_at, id LIMIT 1').get().id;
  const movementInsert = db.prepare(`
    INSERT INTO stock_movements (
      id, variant_id, inventory_unit_id, user_id, movement_type, quantity,
      stock_before, stock_after, cost, price, reason, notes, reference_type,
      reference_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const raw of arrayValue(data.movements, 'movements', 250_000)) {
    const row = objectValue(raw, 'movement');
    const movementId = id(row.id, 'movement.id');
    const variantId = id(row.productId, 'movement.productId');
    if (!db.prepare('SELECT 1 FROM product_variants WHERE id = ?').get(variantId)) throw invalid(`El movimiento ${movementId} referencia un producto inexistente.`);
    const imei = normalizeImei(text(row.imei, 'movement.imei', { max: 30 }));
    let unitId = text(row.unitId, 'movement.unitId', { max: 120 });
    if (!unitId && imei) {
      unitId = db.prepare('SELECT id FROM inventory_units WHERE variant_id = ? AND imei = ? COLLATE NOCASE').get(variantId, imei)?.id || '';
    }
    if (unitId && !db.prepare('SELECT 1 FROM inventory_units WHERE id = ? AND variant_id = ?').get(unitId, variantId)) throw invalid(`El movimiento ${movementId} referencia una unidad inválida.`);
    const userId = id(row.userId, 'movement.userId');
    if (!db.prepare('SELECT 1 FROM users WHERE id = ?').get(userId)) throw invalid(`El movimiento ${movementId} referencia un usuario inexistente.`);
    const quantity = number(row.quantity, 'movement.quantity', { min: -100_000_000, max: 100_000_000, integer: true });
    if (quantity === 0) throw invalid(`El movimiento ${movementId} tiene cantidad cero.`);
    const before = number(row.stockBefore, 'movement.stockBefore', { min: 0, max: 100_000_000, integer: true });
    const after = number(row.stockAfter, 'movement.stockAfter', { min: 0, max: 100_000_000, integer: true });
    if (before + quantity !== after) throw invalid(`El movimiento ${movementId} no cuadra con su stock anterior/posterior.`);
    const type = row.movementType || movementTypeFromLabel(row.type) || 'ADJUSTMENT';
    if (!['INITIAL_IMPORT', 'PURCHASE', 'SALE', 'MANUAL_IN', 'MANUAL_OUT', 'RETURN', 'ADJUSTMENT', 'TRANSFER', 'LOSS', 'REPAIR', 'SALE_ANNULMENT'].includes(type)) throw invalid(`Tipo de movimiento inválido en ${movementId}.`);
    movementInsert.run(
      movementId, variantId, unitId || null, userId, type, quantity, before, after,
      row.cost === null || row.cost === undefined ? null : number(row.cost, 'movement.cost', { min: 0, max: 1_000_000_000_000 }),
      row.price === null || row.price === undefined ? null : number(row.price, 'movement.price', { min: 0.000001, max: 1_000_000_000_000 }),
      nullable(row.reason, 'movement.reason', 500), nullable(row.notes, 'movement.notes'), nullable(row.referenceType, 'movement.referenceType', 120), nullable(row.referenceId, 'movement.referenceId', 120), date(row.createdAt || row.date, 'movement.createdAt', nowIso())
    );
  }

  const reservationInsert = db.prepare(`
    INSERT INTO reservations (
      id, inventory_unit_id, customer_id, user_id, reserved_at, expires_at,
      deposit, status, notes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const raw of arrayValue(data.reservations, 'reservations', 100_000)) {
    const row = objectValue(raw, 'reservation');
    const reservationId = id(row.id, 'reservation.id');
    const unitId = id(row.unitId, 'reservation.unitId');
    const customerId = id(row.customerId, 'reservation.customerId');
    if (!db.prepare('SELECT 1 FROM inventory_units WHERE id = ?').get(unitId)) throw invalid(`La reserva ${reservationId} referencia una unidad inexistente.`);
    if (!db.prepare('SELECT 1 FROM customers WHERE id = ?').get(customerId)) throw invalid(`La reserva ${reservationId} referencia un cliente inexistente.`);
    const rawStatus = text(row.status, 'reservation.status', { required: true, max: 40 }).toUpperCase();
    const status = { 'ACTIVA': 'ACTIVE', 'CANCELADA': 'CANCELLED', 'CONVERTIDA': 'CONVERTED', 'EXPIRADA': 'EXPIRED', ACTIVE: 'ACTIVE', CANCELLED: 'CANCELLED', CONVERTED: 'CONVERTED', EXPIRED: 'EXPIRED' }[rawStatus];
    if (!status) throw invalid(`La reserva ${reservationId} tiene un estado inválido.`);
    const unitStatus = db.prepare('SELECT unit_status FROM inventory_units WHERE id = ?').get(unitId).unit_status;
    if (status === 'ACTIVE' && unitStatus !== 'RESERVED') throw invalid(`La reserva activa ${reservationId} no tiene una unidad reservada.`);
    const created = date(row.createdAt, 'reservation.createdAt', nowIso());
    reservationInsert.run(
      reservationId, unitId, customerId, systemUserId, created, date(row.expiresAt, 'reservation.expiresAt'),
      number(row.deposit ?? 0, 'reservation.deposit', { min: 0, max: 1_000_000_000_000 }), status,
      nullable(row.notes, 'reservation.notes'), created, created
    );
  }

  const claimInsert = db.prepare(`
    INSERT INTO warranty_claims (
      id, inventory_unit_id, customer_id, user_id, received_at, expires_at,
      reason, status, notes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const raw of arrayValue(data.warrantyClaims, 'warrantyClaims', 100_000)) {
    const row = objectValue(raw, 'warrantyClaim');
    const claimId = id(row.id, 'warrantyClaim.id');
    const unitId = id(row.unitId, 'warrantyClaim.unitId');
    if (!db.prepare('SELECT 1 FROM inventory_units WHERE id = ?').get(unitId)) throw invalid(`La garantía ${claimId} referencia una unidad inexistente.`);
    const customerId = text(row.customerId, 'warrantyClaim.customerId', { max: 120 });
    if (customerId && !db.prepare('SELECT 1 FROM customers WHERE id = ?').get(customerId)) throw invalid(`La garantía ${claimId} referencia un cliente inexistente.`);
    const statusMap = {
      'EN GARANTÍA': 'IN_WARRANTY', 'FUERA DE GARANTÍA': 'OUT_OF_WARRANTY', 'EN REVISIÓN': 'IN_REVIEW', RESUELTO: 'RESOLVED',
      IN_WARRANTY: 'IN_WARRANTY', OUT_OF_WARRANTY: 'OUT_OF_WARRANTY', IN_REVIEW: 'IN_REVIEW', RESOLVED: 'RESOLVED'
    };
    const status = statusMap[text(row.status, 'warrantyClaim.status', { required: true, max: 40 })];
    if (!status) throw invalid(`La garantía ${claimId} tiene un estado inválido.`);
    const created = date(row.receivedAt, 'warrantyClaim.receivedAt', nowIso());
    claimInsert.run(
      claimId, unitId, customerId || null, systemUserId, created, date(row.expiresAt, 'warrantyClaim.expiresAt'),
      text(row.reason, 'warrantyClaim.reason', { required: true, max: 2000 }), status,
      nullable(row.notes, 'warrantyClaim.notes'), created, created
    );
  }
}

function insertAuditLogs(db, data) {
  const insert = db.prepare(`
    INSERT INTO audit_logs (
      id, user_id, action, entity_type, entity_id, before_value, after_value,
      ip_address, user_agent, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?)
  `);
  for (const raw of arrayValue(data.auditLogs, 'auditLogs', 250_000)) {
    const row = objectValue(raw, 'auditLog');
    const userId = text(row.userId, 'auditLog.userId', { max: 120 });
    if (userId && !db.prepare('SELECT 1 FROM users WHERE id = ?').get(userId)) throw invalid(`La auditoría ${row.id} referencia un usuario inexistente.`);
    insert.run(
      id(row.id, 'auditLog.id'), userId || null, text(row.action, 'auditLog.action', { required: true, max: 300 }),
      text(row.entityType || 'system', 'auditLog.entityType', { max: 120 }), text(row.entity || row.entityId, 'auditLog.entity', { required: true, max: 120 }),
      nullable(row.before, 'auditLog.before', 20_000), nullable(row.after, 'auditLog.after', 20_000), date(row.createdAt, 'auditLog.createdAt', nowIso())
    );
  }
}

function validateSerialInventory(db) {
  const invalidSoldUnit = db.prepare(`
    SELECT iu.id
    FROM inventory_units iu
    LEFT JOIN sale_items si ON si.inventory_unit_id = iu.id
    WHERE iu.unit_status = 'SOLD' AND si.id IS NULL
    LIMIT 1
  `).get();
  if (invalidSoldUnit) throw invalid(`La unidad ${invalidSoldUnit.id} figura vendida sin una venta asociada.`);
  const variants = db.prepare('SELECT * FROM product_variants').all();
  for (const variant of variants) {
    const stock = db.prepare('SELECT quantity FROM inventory WHERE variant_id = ?').get(variant.id).quantity;
    if (variant.requires_imei === 1) {
      const count = db.prepare("SELECT COUNT(*) AS count FROM inventory_units WHERE variant_id = ? AND unit_status IN ('AVAILABLE', 'RESERVED')").get(variant.id).count;
      if (count !== stock) throw invalid(`El inventario serial del producto ${variant.id} no coincide con sus unidades disponibles/reservadas.`);
    } else {
      const count = db.prepare('SELECT COUNT(*) AS count FROM inventory_units WHERE variant_id = ?').get(variant.id).count;
      if (count !== 0) throw invalid(`El producto no serial ${variant.id} contiene unidades individualizadas.`);
    }
  }
}

function populateStagingDatabase(staging, data) {
  insertStagingSecurity(staging, data);
  insertStagingSettings(staging, data.settings);
  insertStagingOptions(staging, data);
  insertStagingContacts(staging, data);
  insertStagingProducts(staging, data);
  const targetStatuses = insertPurchasesAndUnits(staging, data);
  insertSales(staging, data);
  applyTargetUnitStatuses(staging, targetStatuses);
  insertReturns(staging, data);
  insertPayments(staging, data);
  insertMovementsReservationsAndClaims(staging, data);
  insertAuditLogs(staging, data);
  insertErrorLogs(staging, data);
  validateSerialInventory(staging);
  const foreignKeys = staging.pragma('foreign_key_check');
  if (foreignKeys.length) throw invalid('El backup contiene referencias de dominio inválidas.');
  const integrity = staging.pragma('integrity_check');
  if (!integrity.length || integrity[0].integrity_check !== 'ok') throw invalid('El backup no supera la validación de integridad SQLite.');
}

function userMapping(staging, current, actorId) {
  const map = new Map();
  for (const user of staging.prepare('SELECT id, email FROM users').all()) {
    const local = current.prepare('SELECT id FROM users WHERE email = ? COLLATE NOCASE').get(user.email);
    map.set(user.id, local?.id || actorId);
  }
  return map;
}

function copyDomainTable(current, staging, table, mapping, now) {
  const columns = tableColumns[table];
  const select = staging.prepare(`SELECT ${columns.join(', ')} FROM ${table}`).all();
  const insert = current.prepare(`INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`);
  for (const row of select) {
    const values = columns.map(column => {
      // Las unidades se insertan inicialmente como disponibles para que el
      // trigger de sale_items pueda validarlas; el estado final se reaplica
      // después de copiar ventas, devoluciones y reservas.
      if (table === 'inventory_units' && column === 'unit_status') return 'AVAILABLE';
      if (userColumns.has(column) && row[column]) return mapping.get(row[column]) || row[column];
      if (table === 'settings' && column === 'value_json' && row.key === 'lastBackup') return JSON.stringify(now);
      return row[column];
    });
    insert.run(...values);
  }
}

function applyRestoredUnitStatuses(current, staging) {
  const update = current.prepare('UPDATE inventory_units SET unit_status = ? WHERE id = ?');
  for (const row of staging.prepare('SELECT id, unit_status FROM inventory_units').all()) {
    const updated = update.run(row.unit_status, row.id);
    if (updated.changes !== 1) throw new Error(`No se pudo restaurar el estado de la unidad ${row.id}.`);
  }
}

function clearCurrentDomain(db) {
  const order = [
    // Las reservas de comercio y sus eventos dependen de ventas/variantes;
    // se limpian antes del dominio para que un restore no deje referencias
    // apuntando a operaciones que ya no existen.
    'commerce_hold_events', 'commerce_hold_items', 'commerce_events', 'commerce_nonces', 'commerce_holds',
    'inventory_reconciliations', 'warranty_claims', 'reservations', 'sale_return_items', 'sale_returns',
    'payments', 'stock_movements', 'sale_items', 'sales', 'inventory_units', 'purchase_items',
    'purchases', 'inventory', 'product_variants', 'products', 'suppliers', 'customers', 'options',
    'product_models', 'capacities', 'colors', 'categories', 'locations', 'brands', 'settings', 'audit_logs', 'error_logs'
  ];
  for (const table of order) db.prepare(`DELETE FROM ${table}`).run();
}

export function restoreBackup(db, envelope, actor, request) {
  const data = validateBackupEnvelope(envelope);
  const staging = createDatabase(':memory:', { seed: false, bootstrap: false });
  try {
    try {
      populateStagingDatabase(staging, data);
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw invalid(error.message || 'No se pudo construir una base restaurable.');
    }

    const restoredAt = nowIso();
    const result = db.transaction(() => {
      clearCurrentDomain(db);
      const mapping = userMapping(staging, db, actor.id);
      for (const table of domainTables) copyDomainTable(db, staging, table, mapping, restoredAt);
      applyRestoredUnitStatuses(db, staging);
      saveSetting(db, 'lastBackup', restoredAt, actor.id, restoredAt);
      const foreignKeys = db.pragma('foreign_key_check');
      if (foreignKeys.length) throw new Error('La restauración produjo referencias inválidas.');
      const recordCount = requiredArrays.reduce((sum, key) => sum + data[key].length, 0);
      insertBackupLog(db, {
        userId: actor.id,
        action: 'RESTORE',
        formatVersion: 3,
        filename: request.get?.('x-backup-filename') || null,
        recordCount,
        byteCount: Buffer.byteLength(JSON.stringify(envelope), 'utf8'),
        checksum: sha256(JSON.stringify(data)),
        metadata: { sourceVersion: envelope.version, exportedAt: envelope.exportedAt || null },
        createdAt: restoredAt
      });
      recordAudit(db, {
        userId: actor.id,
        action: 'Backup restaurado',
        entityType: 'backup',
        entityId: 'restore',
        before: null,
        after: { recordCount, restoredAt },
        request,
        createdAt: restoredAt
      });
      return { recordCount, restoredAt };
    }).immediate();
    return result;
  } finally {
    if (staging.open) staging.close();
  }
}

export { clearCurrentDomain };
