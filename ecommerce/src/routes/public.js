import express from 'express';
import { AppError } from '../lib/errors.js';
import { requireCsrf } from '../lib/auth-guard.js';
import { getPublicSettings, getContentBlocks } from '../services/settings.js';
import { flattenCatalog, publicProduct } from '../services/catalog-client.js';
import { matchesCondition, normalizeCondition } from '../lib/catalog-filter.js';
import { recordAnalytics } from '../services/analytics.js';
import { getDatabase } from '../db/database.js';
import { email as validateEmail, oneOf, text } from '../lib/validation.js';

export function publicRouter({ config, catalogClient }) {
  const router = express.Router();

  router.get('/config', (_req, res) => {
    res.json({ data: { store: getPublicSettings(config), content: getContentBlocks() } });
  });

  router.get('/catalog', async (req, res) => {
    const catalog = await catalogClient.getCatalog({ fresh: req.query.fresh === '1' });
    const settings = getPublicSettings();
    if (!settings.catalogEnabled) throw new AppError('El catálogo público está temporalmente deshabilitado.', { status: 404, code: 'CATALOG_DISABLED' });
    const data = applyMerchandising(filterCatalog(catalog, req.query), String(req.query.sort || 'relevance'));
    res.set('Cache-Control', 'public, max-age=5, stale-while-revalidate=15');
    res.json({ data, meta: { source: 'NEXO_STOCK', stale: Boolean(catalog._stale), syncedAt: new Date().toISOString() } });
  });

  router.get('/categories', async (_req, res) => {
    if (!getPublicSettings().catalogEnabled) throw new AppError('El catálogo público está temporalmente deshabilitado.', { status: 404, code: 'CATALOG_DISABLED' });
    const catalog = flattenCatalog(await catalogClient.getCatalog());
    const categories = new Map();
    for (const product of catalog.products) {
      if (!product.categoryId) continue;
      categories.set(product.categoryId, { id: product.categoryId, name: product.category || 'Otros', slug: slug(product.category || 'otros') });
    }
    res.json({ data: Array.from(categories.values()) });
  });

  router.get('/trending', async (_req, res) => {
    if (!getPublicSettings().catalogEnabled) throw new AppError('El catálogo público está temporalmente deshabilitado.', { status: 404, code: 'CATALOG_DISABLED' });
    const catalog = await catalogClient.getCatalog();
    const products = applyMerchandising({ products: flattenCatalog(catalog).products.filter((product) => product.published === true).map(publicProduct) }).products.filter((product) => product.isTrending || product.featured);
    res.set('Cache-Control', 'public, max-age=10, stale-while-revalidate=30');
    res.json({ data: products.slice(0, 12) });
  });

  router.get('/products/:id', async (req, res) => {
    if (!getPublicSettings().catalogEnabled) throw new AppError('El catálogo público está temporalmente deshabilitado.', { status: 404, code: 'CATALOG_DISABLED' });
    const catalog = flattenCatalog(await catalogClient.getCatalog());
    const identifier = String(req.params.id);
    const product = catalog.products.find((item) => String(item.id) === identifier || slug(item.name) === identifier);
    if (!product || product.published !== true) throw new AppError('Producto no encontrado.', { status: 404, code: 'PRODUCT_NOT_FOUND' });
    const related = catalog.products.filter((item) => item.id !== product.id && item.published !== false && (item.brandId === product.brandId || item.categoryId === product.categoryId)).slice(0, 4).map(publicProduct);
    res.set('Cache-Control', 'public, max-age=10, stale-while-revalidate=30');
    res.json({ data: { product: publicProduct(product), related } });
  });

  router.post('/back-stock', requireCsrf(config), (req, res) => {
    const variantId = String(req.body?.inventoryVariantId || '').trim();
    const email = validateEmail(req.body?.email);
    if (!variantId) throw new AppError('La variante no es válida.', { code: 'VALIDATION_ERROR' });
    getDatabase().prepare(`INSERT INTO back_in_stock_notifications (inventory_variant_id, email) VALUES (?, ?)
      ON CONFLICT(inventory_variant_id, email) DO UPDATE SET status = 'PENDING', notified_at = NULL`).run(variantId, email);
    res.status(202).json({ data: { message: 'Te avisaremos cuando vuelva a estar disponible.' } });
  });

  router.post('/analytics', requireCsrf(config), (req, res) => {
    // Lista cerrada: el navegador no decide qué se persiste. Coincide con el
    // CHECK de analytics_events; ORDER_COMPLETED y COUPON_APPLIED se escriben
    // sólo desde el servidor porque dependen del pedido ya confirmado.
    const event = oneOf(req.body?.event, ['VISIT', 'PRODUCT_VIEW', 'SEARCH', 'ADD_TO_CART', 'REMOVE_FROM_CART', 'CHECKOUT_STARTED', 'CHECKOUT_ABANDONED', 'WISHLIST_ADDED', 'OUT_OF_STOCK'], 'event');
    const anonymousId = text(req.body?.anonymousId, 'anonymousId', { max: 100 });
    const sessionId = text(req.body?.sessionId, 'sessionId', { max: 100 });
    const productId = text(req.body?.productId, 'productId', { max: 160 });
    const variantId = text(req.body?.variantId, 'variantId', { max: 160 });
    const query = text(req.body?.query, 'query', { max: 100 });
    // Sin identificador anónimo no hay forma de atribuir el evento. Y un evento
    // de producto sin producto, o una búsqueda sin consulta, no aportan nada.
    const NO_PRODUCT_OK = new Set(['VISIT', 'CHECKOUT_STARTED', 'CHECKOUT_ABANDONED']);
    if (!anonymousId) return res.status(202).json({ data: { accepted: true } });
    if (!productId && !query && !NO_PRODUCT_OK.has(event)) return res.status(202).json({ data: { accepted: true } });
    recordAnalytics(event, {
      anonymousId,
      sessionId: sessionId || null,
      productId: productId || null,
      variantId: variantId || null,
      metadata: query ? { query } : {}
    });
    res.status(202).json({ data: { accepted: true } });
  });

  return router;
}

function filterCatalog(catalog, query = {}) {
  const flattened = flattenCatalog(catalog);
  const search = String(query.q || '').trim().toLowerCase();
  const brand = String(query.brand || '').trim().toLowerCase();
  const category = String(query.category || '').trim().toLowerCase();
  const capacity = String(query.capacity || '').trim().toLowerCase();
  const color = String(query.color || '').trim().toLowerCase();
  const model = String(query.model || '').trim().toLowerCase();
  const condition = normalizeCondition(query.condition);
  const availability = String(query.availability || '').trim();
  const discount = String(query.discount || '').trim();
  const minPrice = numberOrNull(query.minPrice);
  const maxPrice = numberOrNull(query.maxPrice);
  // Cualquier filtro que recorte variantes deja el producto vacío si ninguna
  // sobrevive; entonces el producto tampoco debe llegar a la lista. La condición
  // cuenta porque recorta variantes igual que precio o disponibilidad.
  const NARROWED = Boolean(capacity || color || model || condition || availability || discount || minPrice !== null || maxPrice !== null);
  let products = flattened.products.filter((product) => product.published === true);
  if (search) products = products.filter((product) => [product.name, product.brand, product.model, product.category, ...(product.variants || []).flatMap((variant) => [variant.sku, variant.capacity, variant.color])].join(' ').toLowerCase().includes(search));
  if (brand) products = products.filter((product) => String(product.brand || '').toLowerCase() === brand);
  if (category) products = products.filter((product) => String(product.category || '').toLowerCase() === category || slug(product.category || '') === category);
  if (model) products = products.filter((product) => String(product.model || '').toLowerCase() === model || slug(product.model || '') === model);
  // La condición no se aplica como filtro de producto: se resuelve por variante
  // más abajo, igual que precio o disponibilidad. Si se filtrara el producto
  // entero, un iPhone con variantes nuevas y usadas desaparecería al pedir
  // cualquiera de las dos condiciones.
  if (condition) products = products.filter((product) => (product.variants || []).some((variant) => matchesCondition(variant.condition, condition)));
  products = products.map((product) => {
    let filtered = (product.variants || []).filter((variant) => (!capacity || String(variant.capacity || '').toLowerCase() === capacity) && (!color || String(variant.color || '').toLowerCase() === color));
    if (condition) filtered = filtered.filter((variant) => matchesCondition(variant.condition, condition));
    const safe = publicProduct({ ...product, variants: filtered });
    if (availability === 'in') safe.variants = safe.variants.filter((variant) => variant.availability !== 'OUT');
    if (availability === 'out') safe.variants = safe.variants.filter((variant) => variant.availability === 'OUT');
    if (discount === 'true') safe.variants = safe.variants.filter((variant) => variant.previousPrice && variant.previousPrice > variant.price);
    // El precio se filtra por variante: un producto sigue siendo alcanzable si
    // alguna de sus variantes cae en el rango, y el precio mostrado es el de esa.
    if (minPrice !== null || maxPrice !== null) {
      safe.variants = safe.variants.filter((variant) => (minPrice === null || (Number.isFinite(variant.price) && variant.price >= minPrice)) && (maxPrice === null || (Number.isFinite(variant.price) && variant.price <= maxPrice)));
    }
    return safe;
  }).filter((product) => NARROWED ? product.variants.length > 0 : true);
  const sort = String(query.sort || 'relevance');
  products.sort((a, b) => {
    const priceA = lowestPrice(a);
    const priceB = lowestPrice(b);
    if (sort === 'price-asc') return priceA - priceB;
    if (sort === 'price-desc') return priceB - priceA;
    if (sort === 'offers') return offerPercent(b) - offerPercent(a);
    if (sort === 'newest') return String(b.publishedAt || '').localeCompare(String(a.publishedAt || ''));
    if (sort === 'best-sellers') return Number(Boolean(b.isTrending)) - Number(Boolean(a.isTrending)) || (b.sortOrder || 0) - (a.sortOrder || 0);
    return Number(Boolean(b.isTrending)) - Number(Boolean(a.isTrending)) || String(a.name).localeCompare(String(b.name));
  });
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(48, Math.max(1, Number(query.pageSize) || 24));
  const total = products.length;
  return { products: products.slice((page - 1) * pageSize, page * pageSize), page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

/** El precio más bajo con dato real; Infinity para lo que no se puede comprar. */
function lowestPrice(product) {
  const known = (product.variants || []).map((variant) => variant.price).filter((price) => Number.isFinite(price));
  return known.length ? Math.min(...known) : Infinity;
}

function numberOrNull(value) {
  const parsed = Number(value);
  return value === undefined || value === null || value === '' || !Number.isFinite(parsed) || parsed < 0 ? null : parsed;
}

function offerPercent(product) {
  const variant = product.variants?.[0];
  if (!variant?.previousPrice || variant.previousPrice <= variant.price) return 0;
  return Math.round((1 - variant.price / variant.previousPrice) * 100);
}

function applyMerchandising(data, sort = 'relevance') {
  const rows = getDatabase().prepare('SELECT inventory_product_id, featured, trending, sort_order FROM merchandising_products').all();
  if (!rows.length) return data;
  const byId = new Map(rows.map((row) => [String(row.inventory_product_id), row]));
  const products = (data.products || []).map((product) => { const row = byId.get(String(product.id)); return row ? { ...product, featured: Boolean(row.featured), isTrending: Boolean(row.trending) || Boolean(product.isTrending), sortOrder: row.sort_order } : product; });
  // El orden manual del panel sólo decide cuando el visitante no eligió uno:
  // si no, pisaba "precio más bajo" o "nuevos" y el filtro parecía roto.
  const manual = !sort || sort === 'relevance' || sort === 'best-sellers';
  return { ...data, products: manual ? products.sort((a, b) => (b.sortOrder || 0) - (a.sortOrder || 0)) : products };
}

function slug(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
