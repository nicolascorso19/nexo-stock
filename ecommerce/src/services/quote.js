import crypto from 'node:crypto';
import { getDatabase } from '../db/database.js';
import { AppError } from '../lib/errors.js';
import { toCents, percentageOf, clampDiscount } from '../lib/money.js';
import { findVariant } from './catalog-client.js';
import { calculateShipping } from './settings.js';

export function quoteCart({ cart, catalog, couponCode = '', customerId = null, fulfillmentMethod = 'PICKUP', locality = '', postalCode = '', config }) {
  const rows = cart?.items || [];
  if (!rows.length) throw new AppError('El carrito está vacío.', { status: 400, code: 'EMPTY_CART' });
  const variants = rows.map((row) => {
    const variant = findVariant(catalog, row.inventory_variant_id);
    if (!variant) throw new AppError('Uno de los productos ya no está disponible.', { status: 409, code: 'PRODUCT_UNAVAILABLE', details: { variantId: row.inventory_variant_id } });
    const product = variant.product;
    if (!product || product.published !== true || variant.published !== true) throw new AppError('Uno de los productos ya no está disponible.', { status: 409, code: 'PRODUCT_UNAVAILABLE', details: { variantId: row.inventory_variant_id } });
    const available = Number(variant.availableQuantity ?? 0);
    if (available < Number(row.quantity)) throw new AppError('El producto no tiene stock suficiente.', { status: 409, code: 'INSUFFICIENT_STOCK', details: { variantId: row.inventory_variant_id, available, requested: row.quantity } });
    if (variant.priceKnown === false || variant.price === null || variant.price === undefined) throw new AppError('El producto no tiene precio de venta registrado.', { status: 503, code: 'PRICE_NOT_REGISTERED', details: { variantId: row.inventory_variant_id } });
    const unitPrice = toCents(variant.price);
    if (unitPrice <= 0) throw new AppError('El precio del producto no es válido.', { status: 503, code: 'INVALID_STOCK_PRICE' });
    return {
      inventoryVariantId: String(row.inventory_variant_id),
      inventoryProductId: String(product.id),
      product,
      variant,
      quantity: Number(row.quantity),
      unitPrice,
      subtotalCents: unitPrice * Number(row.quantity)
    };
  });

  const automatic = applyAutomaticDiscounts(variants);
  const afterAutomatic = variants.map((line, index) => {
    const discount = automatic[index] || 0;
    return { ...line, automaticDiscountCents: discount, afterAutomaticCents: line.subtotalCents - discount };
  });
  const coupon = applyCoupon({ lines: afterAutomatic, couponCode, customerId });
  const lines = afterAutomatic.map((line, index) => {
    const couponDiscount = coupon.lineDiscounts[index] || 0;
    return {
      ...line,
      couponDiscountCents: couponDiscount,
      discountCents: line.automaticDiscountCents + couponDiscount,
      lineTotalCents: line.subtotalCents - line.automaticDiscountCents - couponDiscount,
      product: publicLineProduct(line.product),
      variant: publicLineVariant(line.variant)
    };
  });
  const subtotalCents = lines.reduce((sum, line) => sum + line.subtotalCents, 0);
  const automaticDiscountCents = lines.reduce((sum, line) => sum + line.automaticDiscountCents, 0);
  const couponDiscountCents = lines.reduce((sum, line) => sum + line.couponDiscountCents, 0);
  const discountedSubtotal = subtotalCents - automaticDiscountCents - couponDiscountCents;
  const shipping = fulfillmentMethod === 'SHIPPING'
    ? calculateShipping(locality, postalCode, discountedSubtotal)
    : { available: true, priceCents: 0, estimatedDays: null, zoneId: null };
  if (fulfillmentMethod === 'SHIPPING' && !shipping.available) throw new AppError('El envío no está disponible para esa ubicación.', { status: 400, code: 'SHIPPING_UNAVAILABLE' });
  const shippingCents = Math.max(0, Number(shipping.priceCents || 0));
  const totalCents = discountedSubtotal + shippingCents;
  if (totalCents <= 0) throw new AppError('El total del pedido debe ser mayor a cero.', { status: 422, code: 'ORDER_TOTAL_ZERO' });
  const quote = {
    currency: 'USD',
    lines,
    subtotalCents,
    automaticDiscountCents,
    couponDiscountCents,
    discountCents: automaticDiscountCents + couponDiscountCents,
    shippingCents,
    taxCents: 0,
    totalCents,
    coupon: coupon.coupon,
    shipping,
    stock: {
      verifiedAt: new Date().toISOString(),
      source: 'NEXO_STOCK',
      stale: Boolean(catalog?._stale)
    }
  };
  quote.quoteToken = signQuote(quote, config);
  quote.quoteHash = commercialHash(quote);
  return quote;
}

/**
 * Huella del contenido comercial de la cotización.
 *
 * Sólo se hasolean las líneas y los totales: el precio que ve el cliente. Los
 * campos volátiles (momento de verificación, caducidad del token) quedan
 * fuera, porque si entraran la huella cambiaría en cada consulta y el cliente
 * vería siempre "el precio cambió" sin que haya cambiado nada.
 */
function commercialHash(quote) {
  return crypto.createHash('sha256').update(JSON.stringify({
    lines: quote.lines.map((line) => [line.inventoryVariantId, line.quantity, line.unitPrice, line.subtotalCents, line.discountCents]),
    subtotalCents: quote.subtotalCents,
    discountCents: quote.discountCents,
    shippingCents: quote.shippingCents,
    totalCents: quote.totalCents,
    coupon: quote.coupon?.code || null
  })).digest('hex');
}

function publicLineProduct(product) {
  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    brand: product.brand,
    category: product.category,
    categoryId: product.categoryId,
    images: product.images || []
  };
}

function publicLineVariant(variant) {
  return {
    id: variant.id,
    sku: variant.sku,
    capacity: variant.capacity,
    color: variant.color,
    images: variant.images || [],
    price: (variant.price ?? 0) / 1,
    availableQuantity: variant.availableQuantity ?? 0,
    availability: variant.availability
  };
}

function applyAutomaticDiscounts(lines) {
  const discounts = getDatabase().prepare(`SELECT * FROM automatic_discounts WHERE active = 1 AND (starts_at IS NULL OR starts_at <= ?) AND (ends_at IS NULL OR ends_at >= ?) ORDER BY priority DESC, id`).all(new Date().toISOString(), new Date().toISOString());
  const result = lines.map(() => 0);
  for (const discount of discounts) {
    const eligible = lines.map((line, index) => ({ index, line, amount: line.afterAutomaticCents || line.subtotalCents })).filter(({ line }) => isEligible(discount, line.product));
    if (!eligible.length) continue;
    const base = eligible.reduce((sum, item) => sum + item.amount, 0);
    if (base < discount.minimum_subtotal_cents) continue;
    let total = discount.discount_type === 'PERCENTAGE' ? percentageOf(base, discount.discount_value) : discount.discount_value;
    if (discount.maximum_discount_cents) total = Math.min(total, discount.maximum_discount_cents);
    total = clampDiscount(base, total);
    for (const item of eligible) result[item.index] += item.line.subtotalCents > 0 ? Math.round((total * item.amount) / base) : 0;
  }
  // Corregir redondeos de asignación sin permitir sobre-descuento.
  for (let index = 0; index < result.length; index += 1) result[index] = clampDiscount(lines[index].subtotalCents, result[index]);
  return result;
}

function applyCoupon({ lines, couponCode, customerId }) {
  const empty = { coupon: null, lineDiscounts: lines.map(() => 0) };
  const code = String(couponCode || '').trim().toUpperCase();
  if (!code) return empty;
  const db = getDatabase();
  const coupon = db.prepare('SELECT * FROM coupons WHERE code = ? COLLATE NOCASE').get(code);
  const now = new Date().toISOString();
  if (!coupon || !coupon.active || (coupon.starts_at && coupon.starts_at > now) || (coupon.ends_at && coupon.ends_at < now)) throw new AppError('El cupón no está vigente.', { status: 400, code: 'COUPON_INVALID' });
  if (coupon.max_uses !== null) {
    const count = db.prepare('SELECT COUNT(*) AS count FROM coupon_redemptions cr JOIN orders o ON o.id = cr.order_id WHERE cr.coupon_id = ? AND o.status NOT IN (\'CANCELLED\', \'EXPIRED\')').get(coupon.id).count;
    if (count >= coupon.max_uses) throw new AppError('El cupón alcanzó su límite de usos.', { status: 400, code: 'COUPON_EXHAUSTED' });
  }
  if (coupon.max_uses_per_customer !== null && customerId) {
    const count = db.prepare('SELECT COUNT(*) AS count FROM coupon_redemptions cr JOIN orders o ON o.id = cr.order_id WHERE cr.coupon_id = ? AND cr.customer_id = ? AND o.status NOT IN (\'CANCELLED\', \'EXPIRED\')').get(coupon.id, customerId).count;
    if (count >= coupon.max_uses_per_customer) throw new AppError('El cupón alcanzó su límite de usos para tu cuenta.', { status: 400, code: 'COUPON_EXHAUSTED' });
  }
  const products = new Set(db.prepare('SELECT inventory_product_id FROM coupon_products WHERE coupon_id = ?').all(coupon.id).map((row) => row.inventory_product_id));
  const categories = new Set(db.prepare('SELECT category_id FROM coupon_categories WHERE coupon_id = ?').all(coupon.id).map((row) => row.category_id));
  const eligible = lines.map((line, index) => ({ line, index })).filter(({ line }) => coupon.applies_to_all || products.has(line.product.id) || categories.has(line.product.categoryId));
  if (!eligible.length) throw new AppError('El cupón no aplica a los productos del carrito.', { status: 400, code: 'COUPON_NOT_APPLICABLE' });
  const base = eligible.reduce((sum, item) => sum + item.line.afterAutomaticCents, 0);
  if (base < coupon.minimum_subtotal_cents) throw new AppError('El carrito no alcanza el mínimo del cupón.', { status: 400, code: 'COUPON_MINIMUM_NOT_MET' });
  let total = coupon.discount_type === 'PERCENTAGE' ? percentageOf(base, coupon.discount_value) : coupon.discount_value;
  if (coupon.maximum_discount_cents) total = Math.min(total, coupon.maximum_discount_cents);
  total = clampDiscount(base, total);
  const lineDiscounts = lines.map(() => 0);
  for (const item of eligible) lineDiscounts[item.index] = item.line.afterAutomaticCents > 0 ? Math.round((total * item.line.afterAutomaticCents) / base) : 0;
  return { coupon: { id: coupon.id, code: coupon.code, name: coupon.name, type: coupon.discount_type, value: coupon.discount_value }, lineDiscounts };
}

function isEligible(discount, product) {
  const db = getDatabase();
  const productScope = db.prepare('SELECT 1 FROM automatic_discount_products WHERE discount_id = ? AND inventory_product_id = ?').get(discount.id, String(product.id));
  const categoryScope = db.prepare('SELECT 1 FROM automatic_discount_categories WHERE discount_id = ? AND category_id = ?').get(discount.id, String(product.categoryId));
  const hasScope = Boolean(productScope || categoryScope);
  if (!hasScope) {
    const count = Number(db.prepare('SELECT (SELECT COUNT(*) FROM automatic_discount_products WHERE discount_id = ?) + (SELECT COUNT(*) FROM automatic_discount_categories WHERE discount_id = ?) AS count').get(discount.id, discount.id).count);
    return count === 0;
  }
  return true;
}

function signQuote(quote, config) {
  const payload = JSON.stringify({
    lines: quote.lines.map((line) => [line.inventoryVariantId, line.quantity, line.unitPrice, line.subtotalCents, line.discountCents]),
    subtotalCents: quote.subtotalCents,
    discountCents: quote.discountCents,
    shippingCents: quote.shippingCents,
    totalCents: quote.totalCents,
    couponCode: quote.coupon?.code || null,
    exp: Date.now() + 5 * 60 * 1000
  });
  const encoded = Buffer.from(payload).toString('base64url');
  const signature = crypto.createHmac('sha256', config.stockApi.secret || config.sessionTtlMs).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

export function verifyQuoteToken(token, config) {
  const [encoded, signature] = String(token || '').split('.');
  if (!encoded || !signature) throw new AppError('La cotización expiró. Volvé a confirmar los precios.', { status: 409, code: 'QUOTE_EXPIRED' });
  const expected = crypto.createHmac('sha256', config.stockApi.secret || config.sessionTtlMs).update(encoded).digest('base64url');
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) throw new AppError('La cotización no es válida.', { status: 409, code: 'QUOTE_INVALID' });
  const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  if (payload.exp < Date.now()) throw new AppError('La cotización expiró. Volvé a confirmar los precios.', { status: 409, code: 'QUOTE_EXPIRED' });
  return payload;
}
