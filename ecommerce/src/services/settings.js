import { getDatabase } from '../db/database.js';
import { AppError } from '../lib/errors.js';
import { cents, email, integer, oneOf, text } from '../lib/validation.js';

const EDITABLE_FIELDS = new Set([
  'brand_name', 'legal_name', 'support_email', 'support_phone', 'whatsapp',
  'address_street', 'address_number', 'address_locality', 'address_province',
  'address_country', 'address_postal_code', 'low_stock_threshold',
  'shipping_flat_cents', 'free_shipping_threshold_cents', 'pickup_enabled',
  'shipping_enabled', 'cash_enabled', 'transfer_enabled', 'card_enabled',
  'bank_name', 'bank_cbu', 'bank_alias', 'bank_holder', 'bank_tax_id',
  'public_catalog_enabled', 'seo_title', 'seo_description',
  'ga_measurement_id', 'meta_pixel_id', 'theme_json'
]);

export function getStoreSettings() {
  return getDatabase().prepare('SELECT * FROM store_config WHERE id = 1').get();
}

export function getPublicSettings(config = null) {
  const row = getStoreSettings();
  const cardReady = !config || Boolean(config.mercadoPago?.enabled && config.mercadoPago?.accessToken);
  return {
    brandName: row.brand_name,
    supportEmail: row.support_email,
    supportPhone: row.support_phone,
    whatsapp: row.whatsapp,
    address: {
      street: row.address_street,
      number: row.address_number,
      locality: row.address_locality,
      province: row.address_province,
      country: row.address_country,
      postalCode: row.address_postal_code
    },
    timezone: row.timezone,
    currency: row.currency,
    lowStockThreshold: row.low_stock_threshold,
    shipping: {
      pickupEnabled: Boolean(row.pickup_enabled),
      shippingEnabled: Boolean(row.shipping_enabled),
      flatCents: row.shipping_flat_cents,
      freeFromCents: row.free_shipping_threshold_cents
    },
    payments: {
      cash: Boolean(row.cash_enabled),
      transfer: Boolean(row.transfer_enabled),
      card: Boolean(row.card_enabled) && cardReady
    },
    bank: row.transfer_enabled ? {
      name: row.bank_name,
      cbu: row.bank_cbu,
      alias: row.bank_alias,
      holder: row.bank_holder,
      taxId: row.bank_tax_id
    } : null,
    catalogEnabled: Boolean(row.public_catalog_enabled),
    seo: { title: row.seo_title, description: row.seo_description },
    analytics: {
      // Los identificadores públicos se publican para que el navegador cargue
      // las etiquetas. Sin ellos la tienda funciona igual, sólo sin reportes.
      gaMeasurementId: row.ga_measurement_id,
      metaPixelId: row.meta_pixel_id
    },
    theme: safeJson(row.theme_json)
  };
}

function safeJson(value) {
  try { return JSON.parse(value || '{}'); } catch { return {}; }
}

const SETTING_ALIASES = {
  brandName: 'brand_name', legalName: 'legal_name', supportEmail: 'support_email', supportPhone: 'support_phone',
  whatsapp: 'whatsapp', addressStreet: 'address_street', addressNumber: 'address_number', addressLocality: 'address_locality',
  addressProvince: 'address_province', addressCountry: 'address_country', addressPostalCode: 'address_postal_code',
  lowStockThreshold: 'low_stock_threshold', shippingFlatCents: 'shipping_flat_cents', freeShippingThresholdCents: 'free_shipping_threshold_cents',
  pickupEnabled: 'pickup_enabled', shippingEnabled: 'shipping_enabled', cashEnabled: 'cash_enabled', transferEnabled: 'transfer_enabled', cardEnabled: 'card_enabled',
  bankName: 'bank_name', bankCbu: 'bank_cbu', bankAlias: 'bank_alias', bankHolder: 'bank_holder', bankTaxId: 'bank_tax_id',
  publicCatalogEnabled: 'public_catalog_enabled', seoTitle: 'seo_title', seoDescription: 'seo_description', theme: 'theme_json'
};

export function updateStoreSettings(payload) {
  const current = getStoreSettings();
  const next = { ...current };
  for (const [rawKey, value] of Object.entries(payload || {})) {
    const key = SETTING_ALIASES[rawKey] || rawKey;
    if (!EDITABLE_FIELDS.has(key)) continue;
    next[key] = normalizeSetting(key, value);
  }
  next.updated_at = new Date().toISOString();
  const keys = Object.keys(next).filter((key) => key !== 'id');
  const assignments = keys.map((key) => `${key} = @${key}`).join(', ');
  getDatabase().prepare(`UPDATE store_config SET ${assignments} WHERE id = 1`).run(next);
  return getStoreSettings();
}

function normalizeSetting(key, value) {
  if (key === 'support_email') return email(value, { required: false });
  if (key.endsWith('_cents')) return cents(value, key, { required: true });
  if (key === 'low_stock_threshold') return integer(value, key, { min: 0, max: 100000 });
  if (key.endsWith('_enabled') || key === 'pickup_enabled' || key === 'shipping_enabled' || key === 'cash_enabled' || key === 'transfer_enabled' || key === 'card_enabled') {
    return value ? 1 : 0;
  }
  if (key === 'theme_json') {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new AppError('theme_json debe ser un objeto.', { code: 'VALIDATION_ERROR' });
    return JSON.stringify(value);
  }
  return text(value, key, { required: false, max: 1000 });
}

export function getContentBlocks() {
  return getDatabase().prepare(`
    SELECT id, block_key, block_type, title, subtitle, body, content_json, image_url, link_url, active, starts_at, ends_at, sort_order
    FROM content_blocks
    WHERE active = 1 AND (starts_at IS NULL OR starts_at <= ?) AND (ends_at IS NULL OR ends_at >= ?)
    ORDER BY sort_order, id
  `).all(new Date().toISOString(), new Date().toISOString()).map((row) => ({ ...row, content: safeJson(row.content_json) }));
}

export function upsertContentBlock(input) {
  const key = text(input.blockKey, 'blockKey', { required: true, max: 80 });
  const type = oneOf(input.blockType, ['HERO', 'BANNER', 'ANNOUNCEMENT', 'TRUST', 'SEO', 'HOME_SECTION'], 'blockType');
  const content = typeof input.content === 'object' && input.content !== null ? JSON.stringify(input.content) : '{}';
  const row = {
    block_key: key,
    block_type: type,
    title: text(input.title, 'title', { max: 160 }),
    subtitle: text(input.subtitle, 'subtitle', { max: 300 }),
    body: text(input.body, 'body', { max: 2000 }),
    content_json: content,
    image_url: text(input.imageUrl, 'imageUrl', { max: 1000 }),
    link_url: text(input.linkUrl, 'linkUrl', { max: 1000 }),
    active: input.active === false ? 0 : 1,
    starts_at: input.startsAt || null,
    ends_at: input.endsAt || null,
    sort_order: integer(input.sortOrder, 'sortOrder', { required: false, min: -1000, max: 1000 }) ?? 0,
    updated_at: new Date().toISOString()
  };
  getDatabase().prepare(`
    INSERT INTO content_blocks (block_key, block_type, title, subtitle, body, content_json, image_url, link_url, active, starts_at, ends_at, sort_order, updated_at)
    VALUES (@block_key, @block_type, @title, @subtitle, @body, @content_json, @image_url, @link_url, @active, @starts_at, @ends_at, @sort_order, @updated_at)
    ON CONFLICT(block_key) DO UPDATE SET block_type=excluded.block_type, title=excluded.title, subtitle=excluded.subtitle, body=excluded.body,
      content_json=excluded.content_json, image_url=excluded.image_url, link_url=excluded.link_url, active=excluded.active,
      starts_at=excluded.starts_at, ends_at=excluded.ends_at, sort_order=excluded.sort_order, updated_at=excluded.updated_at
  `).run(row);
  return getContentBlocks().find((item) => item.block_key === key);
}

export function getShippingZones() {
  return getDatabase().prepare('SELECT * FROM shipping_zones WHERE active = 1 ORDER BY name').all().map((row) => ({ ...row, postal_codes: safeJson(row.postal_codes_json) }));
}

export function calculateShipping(locality, postalCode, subtotalCents) {
  const config = getStoreSettings();
  if (!config.shipping_enabled) return { available: false, priceCents: 0, estimatedDays: null };
  if (config.free_shipping_threshold_cents > 0 && subtotalCents >= config.free_shipping_threshold_cents) return { available: true, priceCents: 0, estimatedDays: null, free: true };
  const zones = getShippingZones();
  const normalizedLocality = String(locality || '').trim().toLowerCase();
  const zone = zones.find((item) => {
    const postalCodes = item.postal_codes || [];
    return (item.city && item.city.toLowerCase() === normalizedLocality) || (postalCode && postalCodes.includes(String(postalCode)));
  });
  const priceCents = zone ? zone.price_cents : config.shipping_flat_cents;
  return { available: true, priceCents, estimatedDays: zone ? `${zone.estimated_days_min}-${zone.estimated_days_max} días hábiles` : null, zoneId: zone?.id || null };
}
