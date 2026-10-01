import { AppError } from '../lib/errors.js';
import { randomToken, signRequest } from '../lib/security.js';

const CACHE_TTL_MS = 8000;
const STALE_TTL_MS = 120000;

export class CatalogClient {
  constructor(config, fetchImpl = globalThis.fetch) {
    this.config = config;
    this.fetch = fetchImpl;
    this.cache = null;
    this.lastError = null;
  }

  async request(method, pathname, body, { fresh = false } = {}) {
    if (!this.config.stockApi.secret || !this.config.stockApi.keyId) throw unavailable('La API de stock no está configurada.');
    const url = `${this.config.stockApi.baseUrl}${pathname}`;
    const rawBody = body === undefined ? '' : JSON.stringify(body);
    const timestamp = String(Date.now());
    const nonce = randomToken(18);
    // La firma HMAC cubre la ruta SIN query (igual que el sistema privado, que
    // usa request.originalUrl.split('?')[0]). Si no, añadir un parámetro rompe
    // la validación de la firma.
    const signedPath = String(pathname).split('?')[0];
    const signature = signRequest({ method, pathname: signedPath, timestamp, nonce, body: rawBody, keyId: this.config.stockApi.keyId, secret: this.config.stockApi.secret });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.stockApi.timeoutMs);
    try {
      const response = await this.fetch(url, {
        method,
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'X-ECOMMERCE-KEY-ID': this.config.stockApi.keyId,
          'X-ECOMMERCE-TIMESTAMP': timestamp,
          'X-ECOMMERCE-NONCE': nonce,
          'X-ECOMMERCE-SIGNATURE': signature,
          ...(body?.idempotencyKey ? { 'Idempotency-Key': String(body.idempotencyKey) } : {})
        },
        body: method === 'GET' ? undefined : rawBody,
        signal: controller.signal
      });
      const textBody = await response.text();
      let parsed;
      try { parsed = textBody ? JSON.parse(textBody) : {}; } catch { parsed = {}; }
      if (!response.ok) {
        const error = new AppError(parsed?.error?.message || 'El sistema de inventario rechazó la operación.', { status: response.status >= 500 ? 503 : response.status, code: parsed?.error?.code || 'STOCK_API_ERROR', details: parsed?.error?.details });
        error.stockStatus = response.status;
        throw error;
      }
      return parsed.data ?? parsed;
    } catch (error) {
      if (error instanceof AppError) throw error;
      this.lastError = { code: 'STOCK_API_UNAVAILABLE', message: 'No se pudo verificar la disponibilidad en el sistema de stock.' };
      throw unavailable(this.lastError.message, error);
    } finally {
      clearTimeout(timeout);
    }
  }

  invalidate() {
    this.cache = null;
  }

  async getCatalog({ fresh = false } = {}) {
    const now = Date.now();
    if (!fresh && this.cache && now - this.cache.at < CACHE_TTL_MS) return this.cache.data;
    try {
      // includeUnpriced: el catálogo se muestra aunque falte el precio de venta
    // (la tienda lo rotula "Consultar"). No habilita la compra: la cotización
    // responde PRICE_NOT_REGISTERED para esas variantes.
    const data = await this.request('GET', '/api/integrations/store/catalog?includeUnpriced=true');
      this.cache = { at: now, data };
      this.lastError = null;
      return data;
    } catch (error) {
      if (this.cache && now - this.cache.at < STALE_TTL_MS) return { ...this.cache.data, _stale: true, _staleAt: new Date(this.cache.at).toISOString() };
      throw error;
    }
  }

  async reserve(payload) {
    return this.request('POST', '/api/integrations/store/reservations', payload, { fresh: true });
  }

  async confirmReservation(id, payload) {
    return this.request('POST', `/api/integrations/store/reservations/${encodeURIComponent(id)}/confirm`, payload, { fresh: true });
  }

  async releaseReservation(id, payload) {
    return this.request('POST', `/api/integrations/store/reservations/${encodeURIComponent(id)}/release`, payload, { fresh: true });
  }

  async cancelOrder(externalOrderId, payload) {
    return this.request('POST', `/api/integrations/store/orders/${encodeURIComponent(externalOrderId)}/cancel`, payload, { fresh: true });
  }

  async health() {
    try {
      const result = await this.request('GET', '/api/health');
      return { ok: true, result };
    } catch (error) {
      return { ok: false, code: error.code || 'STOCK_API_UNAVAILABLE' };
    }
  }
}

function unavailable(message, cause) {
  return new AppError(message, { status: 503, code: 'STOCK_API_UNAVAILABLE', cause });
}

export function flattenCatalog(catalog) {
  const products = Array.isArray(catalog?.products) ? catalog.products : [];
  const variants = [];
  for (const product of products) {
    for (const variant of product.variants || []) variants.push({ ...variant, product });
  }
  return { ...catalog, products, variants };
}

export function findVariant(catalog, variantId) {
  const id = String(variantId ?? '');
  return flattenCatalog(catalog).variants.find((variant) => String(variant.id) === id) || null;
}

/** Sólo primitivos y un nivel de anidado: la ficha pública nunca debe llevar estructuras raras. */
function plainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result = {};
  for (const [key, item] of Object.entries(value).slice(0, 40)) {
    const text = typeof item === 'object' && item !== null ? JSON.stringify(item).slice(0, 200) : String(item ?? '').slice(0, 200);
    if (text) result[String(key).slice(0, 80)] = text;
  }
  return result;
}

export function publicProduct(product) {
  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    description: product.description || '',
    brand: product.brand || '',
    brandId: product.brandId,
    model: product.model || '',
    category: product.category || '',
    categoryId: product.categoryId,
    condition: product.condition || 'NEW',
    images: Array.isArray(product.images) ? product.images.filter(Boolean) : [],
    highlights: Array.isArray(product.highlights) ? product.highlights.filter((item) => typeof item === 'string').slice(0, 20) : [],
    specifications: plainObject(product.specifications),
    published: product.published === true,
    // La API privada ya lo envía: sin este campo el orden "nuevos" no tenía
    // ninguna base real y devolvía siempre la lista alfabética.
    publishedAt: product.publishedAt || null,
    featured: Boolean(product.featured),
    isTrending: Boolean(product.isTrending),
    variants: (product.variants || []).filter((variant) => variant.published === true).map(publicVariant)
  };
}

export function publicVariant(variant) {
  const available = Number(variant.availableQuantity ?? variant.stock ?? 0);
  const low = Number(variant.lowStockThreshold ?? 1);
  const state = available <= 0 ? 'OUT' : available <= low ? 'LOW' : 'IN';
  const rawPrice = variant.salePrice ?? variant.sale_price ?? variant.price;
  const priceKnown = rawPrice !== null && rawPrice !== undefined && rawPrice !== '' && Number.isFinite(Number(rawPrice));
  return {
    id: variant.id,
    productId: variant.productId,
    sku: variant.sku,
    capacity: variant.capacity || '',
    color: variant.color || '',
    condition: variant.condition || 'NEW',
    priceKnown,
    price: priceKnown ? Number(rawPrice) : null,
    previousPrice: Number(variant.previousPrice ?? 0) > 0 ? Number(variant.previousPrice) : null,
    appleOfficialPrice: variant.appleOfficialPrice ?? null,
    availableQuantity: available,
    availability: state,
    published: variant.published === true,
    images: Array.isArray(variant.images) ? variant.images.filter(Boolean) : [],
    requiresImei: Boolean(variant.requiresImei ?? variant.requires_imei)
  };
}
