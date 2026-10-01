import bcrypt from 'bcryptjs';
import { nowIso } from '../utils.js';
import { saveSetting } from '../services/settings.js';

const roles = [
  ['admin', 'Administrador', ['*']],
  ['seller', 'Vendedor', ['bootstrap:read', 'product:read', 'sale:read', 'sale:create', 'customer:read', 'customer:create', 'reservation:read', 'reservation:manage']],
  ['inventory', 'Inventario', ['bootstrap:read', 'product:read', 'product:write', 'product:archive', 'stock:adjust', 'purchase:read', 'purchase:create', 'supplier:read', 'supplier:create', 'reservation:read', 'reservation:manage']]
];

const modelDefinitions = [
  { name: 'iPhone 18', status: 'CURRENT', capacities: ['128GB', '256GB', '512GB'], colors: ['Negro', 'Blanco', 'Rosa', 'Azul'] },
  { name: 'iPhone 18 Plus', status: 'CURRENT', capacities: ['128GB', '256GB', '512GB'], colors: ['Negro', 'Blanco', 'Rosa', 'Azul'] },
  { name: 'iPhone 18 Air', status: 'CURRENT', capacities: ['128GB', '256GB', '512GB'], colors: ['Negro', 'Blanco', 'Rosa', 'Azul'] },
  { name: 'iPhone 18 Pro', status: 'CURRENT', capacities: ['128GB', '256GB', '512GB', '1TB'], colors: ['Titanio natural', 'Titanio negro', 'Titanio blanco', 'Titanio desierto'] },
  { name: 'iPhone 18 Pro Max', status: 'CURRENT', capacities: ['256GB', '512GB', '1TB', '2TB'], colors: ['Titanio natural', 'Titanio negro', 'Titanio blanco', 'Titanio desierto'] },
  { name: 'iPhone 17', status: 'CURRENT', capacities: ['128GB', '256GB', '512GB'], colors: ['Negro', 'Blanco', 'Rosa', 'Azul'] },
  { name: 'iPhone 17 Air', status: 'CURRENT', capacities: ['128GB', '256GB', '512GB'], colors: ['Negro', 'Blanco', 'Rosa', 'Azul'] },
  { name: 'iPhone 17 Pro', status: 'CURRENT', capacities: ['128GB', '256GB', '512GB', '1TB'], colors: ['Titanio natural', 'Titanio negro', 'Titanio blanco', 'Titanio desierto'] },
  { name: 'iPhone 17 Pro Max', status: 'CURRENT', capacities: ['256GB', '512GB', '1TB', '2TB'], colors: ['Titanio natural', 'Titanio negro', 'Titanio blanco', 'Titanio desierto'] },
  { name: 'iPhone 16', status: 'CURRENT', capacities: ['128GB', '256GB', '512GB'], colors: ['Negro', 'Blanco', 'Rosa', 'Verde'] },
  { name: 'iPhone 16 Plus', status: 'CURRENT', capacities: ['128GB', '256GB', '512GB'], colors: ['Negro', 'Blanco', 'Rosa', 'Verde'] },
  { name: 'iPhone 16 Pro', status: 'CURRENT', capacities: ['128GB', '256GB', '512GB', '1TB'], colors: ['Titanio natural', 'Titanio negro', 'Titanio blanco', 'Titanio desierto'] },
  { name: 'iPhone 16 Pro Max', status: 'CURRENT', capacities: ['256GB', '512GB', '1TB', '2TB'], colors: ['Titanio natural', 'Titanio negro', 'Titanio blanco', 'Titanio desierto'] },
  { name: 'iPhone 16e', status: 'CURRENT', capacities: ['128GB', '256GB', '512GB'], colors: ['Negro', 'Blanco'] },
  { name: 'iPhone 15', status: 'OWN_STOCK', capacities: ['128GB', '256GB', '512GB'], colors: ['Negro', 'Blanco', 'Rosa', 'Azul'] },
  { name: 'iPhone 15 Plus', status: 'OWN_STOCK', capacities: ['128GB', '256GB', '512GB'], colors: ['Negro', 'Blanco', 'Rosa', 'Azul'] },
  { name: 'iPhone 15 Pro', status: 'OWN_STOCK', capacities: ['128GB', '256GB', '512GB', '1TB'], colors: ['Titanio natural', 'Titanio negro', 'Titanio blanco', 'Titanio desierto'] },
  { name: 'iPhone 15 Pro Max', status: 'OWN_STOCK', capacities: ['256GB', '512GB', '1TB', '2TB'], colors: ['Titanio natural', 'Titanio negro', 'Titanio blanco', 'Titanio desierto'] },
  { name: 'iPhone 14', status: 'DISCONTINUED', capacities: ['128GB', '256GB', '512GB'], colors: ['Negro', 'Blanco', 'Rosa', 'Rojo', 'Azul'] },
  { name: 'iPhone 14 Plus', status: 'DISCONTINUED', capacities: ['128GB', '256GB', '512GB'], colors: ['Negro', 'Blanco', 'Rosa', 'Rojo', 'Azul'] },
  { name: 'iPhone 14 Pro', status: 'DISCONTINUED', capacities: ['128GB', '256GB', '512GB', '1TB'], colors: ['Titanio natural', 'Titanio negro', 'Titanio blanco', 'Titanio desierto'] },
  { name: 'iPhone 14 Pro Max', status: 'DISCONTINUED', capacities: ['256GB', '512GB', '1TB', '2TB'], colors: ['Titanio natural', 'Titanio negro', 'Titanio blanco', 'Titanio desierto'] },
  { name: 'iPhone 13', status: 'DISCONTINUED', capacities: ['128GB', '256GB', '512GB'], colors: ['Negro', 'Blanco', 'Rosa', 'Rojo', 'Azul', 'Verde'] },
  { name: 'iPhone 13 mini', status: 'DISCONTINUED', capacities: ['128GB', '256GB', '512GB'], colors: ['Negro', 'Blanco', 'Rosa', 'Rojo', 'Azul', 'Verde'] },
  { name: 'iPhone 13 Pro', status: 'DISCONTINUED', capacities: ['128GB', '256GB', '512GB', '1TB'], colors: ['Grafito', 'Oro', 'Plata', 'Verde'] },
  { name: 'iPhone 13 Pro Max', status: 'DISCONTINUED', capacities: ['256GB', '512GB', '1TB'], colors: ['Grafito', 'Oro', 'Plata', 'Verde'] },
  { name: 'iPhone 12', status: 'DISCONTINUED', capacities: ['64GB', '128GB', '256GB'], colors: ['Negro', 'Blanco', 'Rojo', 'Azul', 'Verde'] },
  { name: 'iPhone 12 mini', status: 'DISCONTINUED', capacities: ['64GB', '128GB', '256GB'], colors: ['Negro', 'Blanco', 'Rojo', 'Azul', 'Verde'] },
  { name: 'iPhone 12 Pro', status: 'DISCONTINUED', capacities: ['128GB', '256GB', '512GB'], colors: ['Grafito', 'Oro', 'Plata'] },
  { name: 'iPhone 12 Pro Max', status: 'DISCONTINUED', capacities: ['256GB', '512GB'], colors: ['Grafito', 'Oro', 'Plata'] },
  { name: 'iPhone 11', status: 'DISCONTINUED', capacities: ['64GB', '128GB', '256GB'], colors: ['Negro', 'Blanco', 'Rojo', 'Amarillo', 'Verde'] },
  { name: 'iPhone 11 Pro', status: 'DISCONTINUED', capacities: ['64GB', '128GB', '256GB', '512GB'], colors: ['Verde', 'Gris', 'Oro', 'Plata'] },
  { name: 'iPhone 11 Pro Max', status: 'DISCONTINUED', capacities: ['64GB', '128GB', '256GB'], colors: ['Verde', 'Gris', 'Oro', 'Plata'] },
  { name: 'iPhone XS', status: 'DISCONTINUED', capacities: ['64GB', '128GB', '256GB'], colors: ['Negro', 'Blanco', 'Oro'] },
  { name: 'iPhone XS Max', status: 'DISCONTINUED', capacities: ['64GB', '128GB', '256GB', '512GB'], colors: ['Negro', 'Blanco', 'Oro'] },
  { name: 'iPhone XR', status: 'DISCONTINUED', capacities: ['64GB', '128GB', '256GB'], colors: ['Negro', 'Blanco', 'Rojo', 'Amarillo', 'Azul'] },
  { name: 'iPhone X', status: 'DISCONTINUED', capacities: ['64GB', '256GB'], colors: ['Negro', 'Blanco'] },
  { name: 'iPhone 8', status: 'DISCONTINUED', capacities: ['64GB', '128GB', '256GB'], colors: ['Negro', 'Blanco', 'Oro', 'Gris'] },
  { name: 'iPhone 8 Plus', status: 'DISCONTINUED', capacities: ['64GB', '128GB', '256GB'], colors: ['Negro', 'Blanco', 'Oro', 'Gris'] },
  { name: 'iPhone 7', status: 'DISCONTINUED', capacities: ['32GB', '128GB', '256GB'], colors: ['Negro', 'Rojo', 'Oro', 'Rosa'] },
  { name: 'iPhone 7 Plus', status: 'DISCONTINUED', capacities: ['32GB', '128GB', '256GB'], colors: ['Negro', 'Rojo', 'Oro', 'Rosa'] },
  { name: 'iPhone 6', status: 'DISCONTINUED', capacities: ['16GB', '32GB', '64GB', '128GB'], colors: ['Negro', 'Blanco', 'Oro'] },
  { name: 'iPhone 6 Plus', status: 'DISCONTINUED', capacities: ['16GB', '32GB', '64GB', '128GB'], colors: ['Negro', 'Blanco', 'Oro'] },
  { name: 'iPhone 6s', status: 'DISCONTINUED', capacities: ['16GB', '32GB', '64GB', '128GB'], colors: ['Negro', 'Blanco', 'Oro', 'Rosa'] },
  { name: 'iPhone 6s Plus', status: 'DISCONTINUED', capacities: ['16GB', '32GB', '64GB', '128GB'], colors: ['Negro', 'Blanco', 'Oro', 'Rosa'] }
];

const capacities = ['16GB', '32GB', '64GB', '128GB', '256GB', '512GB', '1TB', '2TB'];
const colors = ['Negro', 'Blanco', 'Rosa', 'Azul', 'Verde', 'Rojo', 'Amarillo', 'Gris', 'Grafito', 'Oro', 'Plata', 'Titanio natural', 'Titanio negro', 'Titanio blanco', 'Titanio desierto'];
const categories = ['Celulares', 'Accesorios', 'Tablets', 'Notebooks', 'Wearables', 'Otros'];
const paymentMethods = ['Efectivo', 'Transferencia', 'Débito', 'Crédito', 'Mercado Pago', 'Otro'];
const conditions = ['Nuevo', 'Usado', 'Reacondicionado', 'Exhibición', 'Reparado'];
const physicalStates = ['10/10', '9/10', '8/10', '7/10', 'Otro'];

function slug(value) {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 60) || 'sin-nombre';
}

function insertOption(db, type, value, sortOrder, metadata = {}) {
  db.prepare(`
    INSERT INTO options (id, option_type, value, label, sort_order, metadata_json, active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
    ON CONFLICT(option_type, value) DO UPDATE SET
      label = excluded.label, sort_order = excluded.sort_order,
      metadata_json = excluded.metadata_json, active = 1, updated_at = excluded.updated_at
  `).run(`option_${type}_${slug(value)}`, type, value, value, sortOrder, JSON.stringify(metadata), nowIso(), nowIso());
}

function insertLookup(db, table, id, name, sortOrder = 0) {
  const hasSort = ['capacities', 'colors'].includes(table);
  const existing = db.prepare(`SELECT id FROM ${table} WHERE name = ? COLLATE NOCASE`).get(name);
  if (existing) {
    db.prepare(`UPDATE ${table} SET active = 1${hasSort ? ', sort_order = ?' : ''}, updated_at = ? WHERE id = ?`)
      .run(...(hasSort ? [sortOrder, nowIso(), existing.id] : [nowIso(), existing.id]));
    return existing.id;
  }
  const columns = hasSort ? '(id, name, sort_order, active, created_at, updated_at)' : '(id, name, active, created_at, updated_at)';
  const placeholders = hasSort ? '(?, ?, ?, 1, ?, ?)' : '(?, ?, 1, ?, ?)';
  const values = hasSort ? [id, name, sortOrder, nowIso(), nowIso()] : [id, name, nowIso(), nowIso()];
  db.prepare(`INSERT INTO ${table} ${columns} VALUES ${placeholders}`).run(...values);
  return id;
}

function insertBrandAndModel(db, model) {
  const brandId = insertLookup(db, 'brands', 'brand_apple', 'Apple');
  insertOption(db, 'brand', 'Apple', 0, { brandId });
  const modelId = `model_apple_${slug(model.name)}`;
  db.prepare(`
    INSERT INTO product_models (id, brand_id, name, availability_status, official_url, active, created_at, updated_at)
    VALUES (?, ?, ?, ?, NULL, 1, ?, ?)
    ON CONFLICT(brand_id, name) DO UPDATE SET availability_status = excluded.availability_status, active = 1, updated_at = excluded.updated_at
  `).run(modelId, brandId, model.name, model.status, nowIso(), nowIso());
  const actualModelId = db.prepare('SELECT id FROM product_models WHERE brand_id = ? AND name = ? COLLATE NOCASE').get(brandId, model.name)?.id || modelId;
  insertOption(db, 'product_model', model.name, 0, { brandId, modelId: actualModelId });
  return actualModelId;
}

function skuFor(modelName, capacity, color, index) {
  const compact = value => String(value).replace(/[^A-Za-z0-9]/g, '').slice(0, 4).toUpperCase();
  return `APL-${compact(modelName.replace(/^iPhone\s*/i, 'IP'))}-${compact(capacity)}-${compact(color)}-${String(index).padStart(2, '0')}`;
}

function insertCatalog(db, adminId) {
  const now = nowIso();
  const locationId = insertLookup(db, 'locations', 'location_cordoba_capital', 'Córdoba Capital');
  const categoryMap = new Map();
  categories.forEach((name, index) => {
    const id = insertLookup(db, 'categories', `category_${slug(name)}`, name);
    insertOption(db, 'category', name, index, { categoryId: id });
    categoryMap.set(name, id);
  });
  insertOption(db, 'location', 'Córdoba Capital', 0, { locationId });
  const capacityMap = new Map();
  capacities.forEach((name, index) => {
    const id = insertLookup(db, 'capacities', `capacity_${slug(name)}`, name, index);
    insertOption(db, 'capacity', name, index, { capacityId: id });
    capacityMap.set(name, id);
  });
  const colorMap = new Map();
  colors.forEach((name, index) => {
    const id = insertLookup(db, 'colors', `color_${slug(name)}`, name, index);
    insertOption(db, 'color', name, index, { colorId: id });
    colorMap.set(name, id);
  });
  paymentMethods.forEach((name, index) => insertOption(db, 'payment_method', name, index));
  conditions.forEach((name, index) => insertOption(db, 'condition', name, index));
  physicalStates.forEach((name, index) => insertOption(db, 'physical_state', name, index));
  ['Entrada', 'Venta', 'Salida manual', 'Devolución', 'Ajuste', 'Transferencia', 'Pérdida', 'Reparación'].forEach((name, index) => insertOption(db, 'movement_type', name, index));
  ['En garantía', 'Fuera de garantía', 'En revisión', 'Resuelto'].forEach((name, index) => insertOption(db, 'warranty_status', name, index));

  let variantIndex = 1;
  for (const model of modelDefinitions) {
    const modelId = insertBrandAndModel(db, model);
    const productId = `catalog_product_${slug(model.name)}`;
    db.prepare(`
      INSERT INTO products (id, model_id, category_id, notes, is_fictional, archived, created_at, updated_at)
      VALUES (?, ?, ?, ?, 0, 0, ?, ?)
      ON CONFLICT(id) DO UPDATE SET model_id = excluded.model_id, category_id = excluded.category_id, archived = 0, updated_at = excluded.updated_at
    `).run(productId, modelId, categoryMap.get('Celulares'), 'Catálogo de referencia. No implica unidades disponibles.', now, now);

    for (const capacity of model.capacities) {
      for (const color of model.colors) {
        const variantId = `catalog_variant_${slug(model.name)}_${slug(capacity)}_${slug(color)}`;
        const capacityId = capacityMap.get(capacity);
        const colorId = colorMap.get(color);
        const variantName = `${capacity} · ${color}`;
        const sku = skuFor(model.name, capacity, color, variantIndex++);
        db.prepare(`
          INSERT INTO product_variants (
            id, product_id, capacity_id, color_id, variant_name, sku, ram, condition,
            physical_state, requires_imei, cost, cost_registered, sale_price, sale_price_registered,
            promo_price, apple_official_price_usd, apple_price_source, min_stock, location_id,
            active, is_fictional, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, NULL, 'Nuevo', '10/10', 1, 0, 0, 0, 0, NULL, NULL, NULL, 1, ?, 1, 0, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            variant_name = excluded.variant_name, capacity_id = excluded.capacity_id,
            color_id = excluded.color_id, sku = excluded.sku, active = 1, updated_at = excluded.updated_at
        `).run(variantId, productId, capacityId, colorId, variantName, sku, locationId, now, now);
        db.prepare(`INSERT INTO inventory (variant_id, quantity, updated_at) VALUES (?, 0, ?) ON CONFLICT(variant_id) DO UPDATE SET quantity = 0, updated_at = excluded.updated_at`).run(variantId, now);
      }
    }
  }

  const genericModels = [
    { model: 'AirPods Pro 2', category: 'Accesorios', requiresImei: false },
    { model: 'Funda de celular', category: 'Accesorios', requiresImei: false },
    { model: 'Cargador USB-C', category: 'Accesorios', requiresImei: false }
  ];
  genericModels.forEach((item, index) => {
    const modelId = `model_generic_${slug(item.model)}`;
    const brandId = insertLookup(db, 'brands', 'brand_generic', 'Generic');
    insertOption(db, 'brand', 'Generic', 99, { brandId });
    db.prepare(`
      INSERT INTO product_models (id, brand_id, name, availability_status, active, created_at, updated_at)
      VALUES (?, ?, ?, 'OWN_STOCK', 1, ?, ?)
      ON CONFLICT(brand_id, name) DO UPDATE SET active = 1, updated_at = excluded.updated_at
    `).run(modelId, brandId, item.model, now, now);
    const actualModelId = db.prepare('SELECT id FROM product_models WHERE brand_id = ? AND name = ? COLLATE NOCASE').get(brandId, item.model)?.id || modelId;
    insertOption(db, 'product_model', item.model, 90 + index, { brandId, modelId: actualModelId });
    const productId = `catalog_product_${slug(item.model)}`;
    const variantId = `catalog_variant_${slug(item.model)}`;
    db.prepare(`INSERT INTO products (id, model_id, category_id, notes, is_fictional, archived, created_at, updated_at) VALUES (?, ?, ?, ?, 0, 0, ?, ?) ON CONFLICT(id) DO NOTHING`).run(productId, actualModelId, categoryMap.get(item.category), 'Catálogo de referencia. No implica unidades disponibles.', now, now);
    db.prepare(`
      INSERT INTO product_variants (
        id, product_id, variant_name, sku, condition, physical_state, requires_imei,
        cost, cost_registered, sale_price, sale_price_registered, min_stock, location_id,
        active, is_fictional, created_at, updated_at
      ) VALUES (?, ?, 'Estándar', ?, 'Nuevo', '10/10', ?, 0, 0, 0, 0, 1, ?, 1, 0, ?, ?)
      ON CONFLICT(id) DO UPDATE SET active = 1, updated_at = excluded.updated_at
    `).run(variantId, productId, `GEN-${slug(item.model).toUpperCase()}`, item.requiresImei ? 1 : 0, locationId, now, now);
    db.prepare(`INSERT INTO inventory (variant_id, quantity, updated_at) VALUES (?, 0, ?) ON CONFLICT(variant_id) DO UPDATE SET quantity = 0, updated_at = excluded.updated_at`).run(variantId, now);
  });
}

function seedSecurity(db) {
  const now = nowIso();
  const rounds = Number(process.env.BCRYPT_ROUNDS || 12);
  const roleInsert = db.prepare('INSERT OR IGNORE INTO roles (id, name, permissions_json, active, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)');
  for (const [id, name, permissions] of roles) roleInsert.run(id, name, JSON.stringify(permissions), now, now);
  const userInsert = db.prepare('INSERT INTO users (id, role_id, name, email, password_hash, active, last_login_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, NULL, ?, ?)');
  userInsert.run('usr_admin', 'admin', 'Nicolás Romero', 'admin@nexo.com', bcrypt.hashSync('admin123', rounds), now, now);
  userInsert.run('usr_vendedor', 'seller', 'Camila Sosa', 'vendedor@nexo.com', bcrypt.hashSync('vendedor123', rounds), now, now);
  userInsert.run('usr_inventario', 'inventory', 'Tomás Alvarez', 'inventario@nexo.com', bcrypt.hashSync('inventario123', rounds), now, now);
}

function seedSettings(db, userId) {
  const settings = {
    businessName: 'NEXO Móviles',
    legalName: 'NEXO Móviles S.A.',
    currency: 'USD',
    locale: 'es-AR',
    locationName: 'Córdoba Capital',
    valuationMethod: 'AVERAGE',
    minMargin: 0,
    defaultMinStock: 1,
    lastUnitThreshold: 1,
    allowNegativeStock: false,
    taxRate: 0,
    logoText: 'N',
    lastBackup: null,
    lowStockNotifications: true,
    publicShowApplePrice: false
  };
  for (const [key, value] of Object.entries(settings)) saveSetting(db, key, value, userId);
}

export function seedDatabase(db, options = {}) {
  const { force = false, preserveSecurity = false, actorId = null } = options;
  const userCount = db.prepare('SELECT COUNT(*) AS count FROM users').get().count;
  if (userCount > 0 && !force) return false;

  const run = () => {
    if (!preserveSecurity && db.prepare('SELECT COUNT(*) AS count FROM users').get().count === 0) {
      seedSecurity(db);
    }
    const adminId = actorId || db.prepare("SELECT id FROM users WHERE role_id = 'admin' ORDER BY id LIMIT 1").get()?.id || null;
    seedSettings(db, adminId);
    insertCatalog(db, adminId);
  };

  if (db.inTransaction) run();
  else db.transaction(run)();
  return true;
}
