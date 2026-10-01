import { AppError, conflict, notFound } from '../errors.js';
import { asBoolean, createId, nowIso, today } from '../utils.js';
import { getProductById, getProducts, PRODUCT_SELECT } from '../db/bootstrap.js';
import { recordAudit } from './audit.js';
import {
  findOrCreateBrand,
  findOrCreateCapacity,
  findOrCreateCategory,
  findOrCreateColor,
  findOrCreateLocation,
  findOrCreateModel,
  requireSupplier
} from './catalog.js';
import { assertMinimumMargin, getSettings } from './settings.js';
import {
  idText,
  nonNegativeInteger,
  nonNegativeMoney,
  optionalText,
  parseDateOnly,
  positiveMoney,
  requireObject,
  requiredText
} from '../validation.js';

function generatedSku(brand, model) {
  const normalize = value => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/gi, '').slice(0, 10).toUpperCase();
  return `NEXO-${normalize(brand)}-${normalize(model)}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
}

function hasValue(value) {
  return value !== undefined && value !== null && String(value).trim() !== '';
}

function publicJson(value, fallback, type) {
  if (value === undefined) return JSON.stringify(fallback);
  if (typeof value === 'string') {
    try { value = JSON.parse(value); } catch { throw new AppError(422, 'INVALID_PUBLIC_JSON', 'El contenido comercial no es válido.'); }
  }
  if (type === 'array' && !Array.isArray(value)) throw new AppError(422, 'INVALID_PUBLIC_JSON', 'Las imágenes y características deben ser una lista.');
  if (type === 'object' && (!value || typeof value !== 'object' || Array.isArray(value))) throw new AppError(422, 'INVALID_PUBLIC_JSON', 'Las especificaciones deben ser un objeto.');
  return JSON.stringify(value);
}

function normalizeProductInput(db, payload, existing, settings, parent = null) {
  const patch = payload && typeof payload === 'object' ? payload : {};
  const source = existing ? { ...existing, ...patch } : { ...(parent || {}), ...patch };
  const brandName = optionalText(source.brand, 'La marca', { max: 100 });
  const modelName = optionalText(source.model, 'El modelo', { max: 140 });
  const categoryName = optionalText(source.category, 'La categoría', { max: 100 });
  if (!brandName || !modelName || !categoryName) throw new AppError(422, 'REQUIRED_FIELD', 'Indicá marca, modelo y categoría.');

  const capacityName = optionalText(source.capacity, 'La capacidad', { max: 40 });
  const colorName = optionalText(source.color, 'El color', { max: 100 });
  const ram = optionalText(source.ram, 'La RAM', { max: 40 });
  const variant = optionalText(source.variant, 'La variante', { max: 180 })
    || [capacityName, colorName].filter(Boolean).join(' · ')
    || ram
    || 'Estándar';
  const condition = optionalText(source.condition, 'La condición', { max: 60 }) || 'Nuevo';
  const physicalState = optionalText(source.physicalState, 'El estado físico', { max: 60 }) || '10/10';

  const costSupplied = Object.hasOwn(patch, 'cost') && hasValue(patch.cost);
  const cost = costSupplied ? nonNegativeMoney(patch.cost, 'El costo') : Number(existing?.cost || 0);
  const costRegistered = Object.hasOwn(patch, 'costRegistered')
    ? asBoolean(patch.costRegistered, false)
    : existing ? Boolean(existing.costKnown ?? cost > 0) : costSupplied;

  const priceSupplied = Object.hasOwn(patch, 'price') || Object.hasOwn(patch, 'salePrice');
  const rawPrice = Object.hasOwn(patch, 'salePrice') ? patch.salePrice : patch.price;
  const price = priceSupplied && hasValue(rawPrice) ? positiveMoney(rawPrice, 'El precio de venta') : Number(existing?.price || 0);
  const salePriceRegistered = Object.hasOwn(patch, 'salePriceRegistered')
    ? asBoolean(patch.salePriceRegistered, false)
    : existing ? Boolean(existing.salePriceKnown ?? price > 0) : priceSupplied;
  if (salePriceRegistered && !(price > 0)) throw new AppError(422, 'PRICE_REQUIRED', 'Ingresá un precio de venta mayor a cero o marcá el precio como no registrado.');

  const promoRaw = Object.hasOwn(patch, 'promoPrice') ? patch.promoPrice : source.promoPrice;
  const promoPrice = promoRaw === undefined || promoRaw === null || promoRaw === '' || Number(promoRaw) === 0
    ? null
    : positiveMoney(promoRaw, 'El precio promocional');
  if (promoPrice !== null && (!salePriceRegistered || promoPrice > price)) {
    throw new AppError(422, 'PROMO_PRICE_TOO_HIGH', 'El precio promocional no puede superar el precio de venta registrado.');
  }

  const officialRaw = Object.hasOwn(patch, 'appleOfficialPriceUsd') ? patch.appleOfficialPriceUsd : source.appleOfficialPriceUsd;
  const appleOfficialPriceUsd = officialRaw === undefined || officialRaw === null || officialRaw === ''
    ? null
    : nonNegativeMoney(officialRaw, 'El precio oficial Apple');
  const applePriceSource = Object.hasOwn(patch, 'applePriceSource') ? optionalText(patch.applePriceSource, 'La fuente Apple', { max: 180 }) : (source.applePriceSource || '');

  const minStock = Object.hasOwn(patch, 'minStock')
    ? nonNegativeInteger(patch.minStock, 'El stock mínimo', { max: 10_000_000 })
    : Number(existing?.minStock ?? settings.defaultMinStock);
  const requiresImei = Object.hasOwn(patch, 'requiresImei')
    ? asBoolean(patch.requiresImei, true)
    : existing ? Boolean(existing.requiresImei) : true;
  const supplierId = optionalText(Object.hasOwn(patch, 'supplierId') ? patch.supplierId : source.supplierId, 'El proveedor', { max: 120 });
  const locationName = optionalText(Object.hasOwn(patch, 'location') ? patch.location : source.location, 'La ubicación', { max: 100 }) || settings.locationName;
  const purchaseDate = parseDateOnly(Object.hasOwn(patch, 'purchaseDate') ? patch.purchaseDate : source.purchaseDate, 'La fecha de compra', existing?.purchaseDate || null);
  const warranty = optionalText(Object.hasOwn(patch, 'warranty') ? patch.warranty : source.warranty, 'La garantía', { max: 120 });
  const notes = optionalText(Object.hasOwn(patch, 'notes') ? patch.notes : source.notes, 'Las notas', { max: 4000 });
  const barcode = optionalText(Object.hasOwn(patch, 'barcode') ? patch.barcode : source.barcode, 'El código de barras', { max: 120 });
  const sku = optionalText(Object.hasOwn(patch, 'sku') ? patch.sku : source.sku, 'El SKU', { max: 80 }) || generatedSku(brandName, modelName);
  const publicSlug = optionalText(Object.hasOwn(patch, 'publicSlug') ? patch.publicSlug : source.publicSlug, 'El slug público', { max: 180 });
  const publicDescription = optionalText(Object.hasOwn(patch, 'publicDescription') ? patch.publicDescription : source.publicDescription, 'La descripción pública', { max: 5000 });
  const publicImages = publicJson(Object.hasOwn(patch, 'publicImages') ? patch.publicImages : source.publicImages, existing?.publicImages || [], 'array');
  const publicHighlights = publicJson(Object.hasOwn(patch, 'publicHighlights') ? patch.publicHighlights : source.publicHighlights, existing?.publicHighlights || [], 'array');
  const publicSpecifications = publicJson(Object.hasOwn(patch, 'publicSpecifications') ? patch.publicSpecifications : source.publicSpecifications, existing?.publicSpecifications || {}, 'object');
  const published = Object.hasOwn(patch, 'published') ? asBoolean(patch.published, false) : existing ? Boolean(existing.published) : false;
  const isTrending = Object.hasOwn(patch, 'isTrending') ? asBoolean(patch.isTrending, false) : existing ? Boolean(existing.isTrending) : false;
  const publishedAt = Object.hasOwn(patch, 'publishedAt') ? (patch.publishedAt || null) : (existing?.publishedAt || null);
  const variantPublished = Object.hasOwn(patch, 'variantPublished') ? asBoolean(patch.variantPublished, published) : Object.hasOwn(patch, 'published') ? published : existing ? Boolean(existing.variantPublished) : published;
  const variantImages = publicJson(Object.hasOwn(patch, 'variantImages') ? patch.variantImages : source.variantImages, existing?.variantImages || [], 'array');
  const previousPrice = Object.hasOwn(patch, 'previousPrice') ? (patch.previousPrice === null || patch.previousPrice === '' ? null : positiveMoney(patch.previousPrice, 'El precio anterior')) : (existing?.previousPrice ?? null);
  const promoStartsAt = Object.hasOwn(patch, 'promoStartsAt') ? (patch.promoStartsAt || null) : (existing?.promoStartsAt || null);
  const promoEndsAt = Object.hasOwn(patch, 'promoEndsAt') ? (patch.promoEndsAt || null) : (existing?.promoEndsAt || null);

  assertMinimumMargin(price, cost, settings, { priceKnown: salePriceRegistered, costKnown: costRegistered });
  const brand = findOrCreateBrand(db, brandName);
  const model = findOrCreateModel(db, brand.name, modelName);
  const category = findOrCreateCategory(db, categoryName);
  const capacity = capacityName ? findOrCreateCapacity(db, capacityName) : null;
  const color = colorName ? findOrCreateColor(db, colorName) : null;
  const location = findOrCreateLocation(db, locationName);
  const supplier = requireSupplier(db, supplierId || null);

  return {
    brand, model, category, capacity, color, location, supplier,
    variant, sku, barcode: barcode || null, ram, condition, physicalState,
    requiresImei, cost, costRegistered, price, salePriceRegistered, promoPrice,
    appleOfficialPriceUsd, applePriceSource, minStock, supplierId: supplier?.id || null,
    locationId: location.id, purchaseDate, warranty, notes,
    publicSlug, publicDescription, publicImages, publicHighlights, publicSpecifications,
    published, isTrending, publishedAt, variantPublished, variantImages,
    previousPrice, promoStartsAt, promoEndsAt,
    isFictional: false
  };
}

function rawVariant(db, id) {
  return db.prepare(`${PRODUCT_SELECT} WHERE pv.id = ?`).get(id);
}

function parentFromVariant(db, variantId) {
  return db.prepare(`
    SELECT p.id, p.model_id, p.category_id, p.notes, p.archived,
           p.public_slug AS publicSlug, p.public_description AS publicDescription, p.public_images_json AS publicImages, p.public_highlights_json AS publicHighlights, p.public_specs_json AS publicSpecifications,
           p.published, p.is_trending, p.published_at,
           b.name AS brand, pm.name AS model, c.name AS category
    FROM product_variants pv
    JOIN products p ON p.id = pv.product_id
    JOIN product_models pm ON pm.id = p.model_id
    JOIN brands b ON b.id = pm.brand_id
    JOIN categories c ON c.id = p.category_id
    WHERE pv.id = ?
  `).get(variantId);
}

function emitCommerceCatalogEvent(db, product) {
  try {
    const payload = JSON.stringify({ productId: product.productId, variantId: product.id, type: 'catalog.updated' });
    for (const client of db.prepare('SELECT id FROM service_clients WHERE active = 1').all()) db.prepare('INSERT INTO commerce_events (id, client_id, event_type, aggregate_id, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(createId('event'), client.id, 'catalog.updated', product.id, payload, nowIso());
  } catch { /* the commerce outbox is optional for older databases */ }
}

function insertVariant(db, parentId, input, now, isFictional = false) {
  const variantId = createId('variant');
  db.prepare(`
    INSERT INTO product_variants (
      id, product_id, capacity_id, color_id, variant_name, sku, barcode, ram,
      condition, physical_state, requires_imei, cost, cost_registered, sale_price,
      sale_price_registered, promo_price, apple_official_price_usd, apple_price_source,
      min_stock, supplier_id, location_id, purchase_date, warranty, notes,
      published, public_images_json, previous_price, promo_starts_at, promo_ends_at, active,
      is_fictional, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
  `).run(
    variantId, parentId, input.capacity?.id || null, input.color?.id || null,
    input.variant, input.sku, input.barcode, input.ram, input.condition,
    input.physicalState, input.requiresImei ? 1 : 0, input.cost,
    input.costRegistered ? 1 : 0, input.price, input.salePriceRegistered ? 1 : 0,
    input.promoPrice, input.appleOfficialPriceUsd, input.applePriceSource || null,
    input.minStock, input.supplierId, input.locationId, input.purchaseDate,
    input.warranty || null, input.notes || null, input.variantPublished ? 1 : 0,
    input.variantImages, input.previousPrice, input.promoStartsAt, input.promoEndsAt,
    isFictional ? 1 : 0, now, now
  );
  db.prepare('INSERT INTO inventory (variant_id, quantity, updated_at) VALUES (?, 0, ?)').run(variantId, now);
  return variantId;
}

export function createProduct(db, payload, user, request) {
  requireObject(payload);
  return db.transaction(() => {
    const settings = getSettings(db);
    const input = normalizeProductInput(db, payload, null, settings);
    const now = nowIso();
    const parentId = payload.parentId || payload.productId || createId('product');
    let parent = db.prepare('SELECT * FROM products WHERE id = ?').get(parentId);
    if (!parent) {
      db.prepare(`INSERT INTO products (id, model_id, category_id, notes, public_slug, public_description, public_images_json, public_highlights_json, public_specs_json, published, is_trending, published_at, is_fictional, archived, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?)`)
        .run(parentId, input.model.id, input.category.id, input.notes || null, input.publicSlug || null, input.publicDescription || null, input.publicImages, input.publicHighlights, input.publicSpecifications, input.published ? 1 : 0, input.isTrending ? 1 : 0, input.publishedAt, now, now);
    } else if (parent.archived) {
      throw conflict('No se pueden agregar variantes a un producto archivado.', 'PRODUCT_ARCHIVED');
    }
    const variants = Array.isArray(payload.variants) && payload.variants.length ? payload.variants : [payload];
    const ids = variants.map((variant, index) => insertVariant(db, parentId, normalizeProductInput(db, { ...payload, ...variant, parentId }, index === 0 ? null : parent, settings), now));
    const product = getProductById(db, ids[0]);
    emitCommerceCatalogEvent(db, product);
    recordAudit(db, { userId: user.id, action: 'Variantes creadas', entityType: 'product', entityId: parentId, before: null, after: { variantIds: ids, product }, request });
    return product;
  }).immediate();
}

export function createVariant(db, parentId, payload, user, request) {
  requireObject(payload);
  idText(parentId, 'El producto padre');
  return db.transaction(() => {
    const parent = db.prepare(`
      SELECT p.*, b.name AS brand, pm.name AS model, c.name AS category
      FROM products p JOIN product_models pm ON pm.id = p.model_id
      JOIN brands b ON b.id = pm.brand_id JOIN categories c ON c.id = p.category_id
      WHERE p.id = ?
    `).get(parentId);
    if (!parent) throw notFound('El producto padre');
    if (parent.archived) throw conflict('El producto está archivado.', 'PRODUCT_ARCHIVED');
    const input = normalizeProductInput(db, payload, null, getSettings(db), parent);
    const variantId = insertVariant(db, parentId, input, nowIso());
    const product = getProductById(db, variantId);
    recordAudit(db, { userId: user.id, action: 'Variante creada', entityType: 'product_variant', entityId: variantId, before: null, after: product, request });
    return product;
  }).immediate();
}

export function getProductVariants(db, parentId) {
  return getProducts(db).filter(product => product.productId === parentId && product.status !== 'Archivado');
}

export function updateProduct(db, id, payload, user, request) {
  requireObject(payload);
  idText(id, 'El id del producto');
  if (!Object.keys(payload).length) throw new AppError(422, 'EMPTY_PATCH', 'Enviá al menos un campo para actualizar.');
  return db.transaction(() => {
    const existing = getProductById(db, id);
    if (!existing) throw notFound('El producto');
    if (existing.status === 'Archivado') throw conflict('No se puede modificar un producto archivado.', 'PRODUCT_ARCHIVED');
    if (Object.hasOwn(payload, 'status') && payload.status === 'Archivado') throw conflict('Usá DELETE /api/products/:id para archivar el producto.', 'USE_ARCHIVE_ENDPOINT');
    if (Object.hasOwn(payload, 'requiresImei') && asBoolean(payload.requiresImei, existing.requiresImei) !== existing.requiresImei && existing.stock > 0) throw conflict('No se puede cambiar la política IMEI de un producto con stock.', 'SERIALIZATION_CHANGE_WITH_STOCK');
    const parent = parentFromVariant(db, id);
    const input = normalizeProductInput(db, payload, existing, getSettings(db), parent);
    const now = nowIso();
    db.prepare('UPDATE products SET model_id = ?, category_id = ?, notes = ?, public_slug = ?, public_description = ?, public_images_json = ?, public_highlights_json = ?, public_specs_json = ?, published = ?, is_trending = ?, published_at = ?, is_fictional = 0, updated_at = ? WHERE id = ?').run(input.model.id, input.category.id, input.notes || null, input.publicSlug || null, input.publicDescription || null, input.publicImages, input.publicHighlights, input.publicSpecifications, input.published ? 1 : 0, input.isTrending ? 1 : 0, input.publishedAt, now, existing.productId);
    db.prepare(`
      UPDATE product_variants SET
        capacity_id = ?, color_id = ?, variant_name = ?, sku = ?, barcode = ?, ram = ?,
        condition = ?, physical_state = ?, requires_imei = ?, cost = ?, cost_registered = ?,
        sale_price = ?, sale_price_registered = ?, promo_price = ?, apple_official_price_usd = ?,
        apple_price_source = ?, min_stock = ?, supplier_id = ?, location_id = ?, purchase_date = ?,
        warranty = ?, notes = ?, published = ?, public_images_json = ?, previous_price = ?, promo_starts_at = ?, promo_ends_at = ?, is_fictional = 0, updated_at = ?
      WHERE id = ?
    `).run(
      input.capacity?.id || null, input.color?.id || null, input.variant, input.sku,
      input.barcode, input.ram, input.condition, input.physicalState, input.requiresImei ? 1 : 0,
      input.cost, input.costRegistered ? 1 : 0, input.price, input.salePriceRegistered ? 1 : 0,
      input.promoPrice, input.appleOfficialPriceUsd, input.applePriceSource || null, input.minStock,
      input.supplierId, input.locationId, input.purchaseDate, input.warranty || null,
      input.notes || null, input.variantPublished ? 1 : 0, input.variantImages,
      input.previousPrice, input.promoStartsAt, input.promoEndsAt, now, id
    );
    const product = getProductById(db, id);
    emitCommerceCatalogEvent(db, product);
    recordAudit(db, { userId: user.id, action: 'Variante actualizada', entityType: 'product_variant', entityId: id, before: existing, after: product, request });
    return product;
  }).immediate();
}

export function updateApplePrice(db, id, payload, user, request) {
  requireObject(payload);
  idText(id, 'El id de la variante');
  return db.transaction(() => {
    const existing = getProductById(db, id);
    if (!existing) throw notFound('El producto');
    const value = payload.appleOfficialPriceUsd;
    const official = value === null || value === '' ? null : nonNegativeMoney(value, 'El precio oficial Apple');
    const source = value === null || value === '' ? '' : optionalText(payload.source || 'Apple.com', 'La fuente', { max: 180 });
    if (official !== null && !source) throw new AppError(422, 'APPLE_SOURCE_REQUIRED', 'Indicá la fuente oficial del precio.');
    const now = nowIso();
    db.prepare('UPDATE product_variants SET apple_official_price_usd = ?, apple_price_source = ?, apple_price_updated_at = ?, apple_price_updated_by = ?, updated_at = ? WHERE id = ?').run(official, source || null, now, user.id, now, id);
    const after = getProductById(db, id);
    emitCommerceCatalogEvent(db, after);
    recordAudit(db, { userId: user.id, action: 'Precio oficial Apple actualizado', entityType: 'product_variant', entityId: id, before: { price: existing.appleOfficialPriceUsd, source: existing.applePriceSource }, after: { price: after.appleOfficialPriceUsd, source: after.applePriceSource }, request });
    return after;
  }).immediate();
}

export function archiveProduct(db, id, user, request) {
  idText(id, 'El id del producto');
  return db.transaction(() => {
    const variants = getProductVariants(db, id);
    if (!variants.length) {
      const variant = getProductById(db, id);
      if (!variant) throw notFound('El producto');
      variants.push(variant);
    }
    if (variants.some(product => product.stock > 0)) throw conflict('No se puede archivar un producto con stock disponible.', 'PRODUCT_HAS_STOCK');
    const now = nowIso();
    const parentIds = [...new Set(variants.map(product => product.productId))];
    for (const parentId of parentIds) {
      db.prepare('UPDATE products SET archived = 1, updated_at = ? WHERE id = ?').run(now, parentId);
      db.prepare('UPDATE product_variants SET active = 0, updated_at = ? WHERE product_id = ?').run(now, parentId);
    }
    const archived = getProductById(db, id);
    recordAudit(db, { userId: user.id, action: 'Producto archivado', entityType: 'product', entityId: parentIds[0], before: variants, after: archived, request });
    return archived;
  }).immediate();
}

export function productExists(db, id, { includeArchived = false } = {}) {
  const row = db.prepare(`SELECT pv.id, p.archived, pv.active FROM product_variants pv JOIN products p ON p.id = pv.product_id WHERE pv.id = ?`).get(id);
  if (!row || (!includeArchived && (row.archived || !row.active))) throw notFound('El producto');
  return row;
}

export { rawVariant, parentFromVariant };
