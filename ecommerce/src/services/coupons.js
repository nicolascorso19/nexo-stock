import { getDatabase, transaction } from '../db/database.js';
import { AppError } from '../lib/errors.js';
import { email, integer, oneOf, text } from '../lib/validation.js';

export function listAutomaticDiscounts() {
  return getDatabase().prepare('SELECT * FROM automatic_discounts ORDER BY priority DESC, created_at DESC').all().map((row) => ({ ...row, minimumSubtotalCents: row.minimum_subtotal_cents, maximumDiscountCents: row.maximum_discount_cents }));
}

export function createAutomaticDiscount(input) {
  const row = normalizeDiscount(input);
  const db = getDatabase();
  const result = db.prepare(`INSERT INTO automatic_discounts (name, discount_type, discount_value, minimum_subtotal_cents, maximum_discount_cents, starts_at, ends_at, priority, active) VALUES (@name, @discount_type, @discount_value, @minimum_subtotal_cents, @maximum_discount_cents, @starts_at, @ends_at, @priority, @active)`).run(row);
  return getDatabase().prepare('SELECT * FROM automatic_discounts WHERE id = ?').get(result.lastInsertRowid);
}

function normalizeDiscount(input) {
  const type = oneOf(input.discountType, ['PERCENTAGE', 'FIXED'], 'discountType');
  return { name: text(input.name, 'name', { required: true, max: 120 }), discount_type: type, discount_value: integer(input.discountValue, 'discountValue', { min: 1, max: type === 'PERCENTAGE' ? 100 : 100000000 }), minimum_subtotal_cents: integer(input.minimumSubtotalCents ?? 0, 'minimumSubtotalCents', { min: 0 }), maximum_discount_cents: integer(input.maximumDiscountCents, 'maximumDiscountCents', { required: false, min: 1 }), starts_at: input.startsAt || null, ends_at: input.endsAt || null, priority: integer(input.priority ?? 0, 'priority', { min: -1000, max: 1000 }), active: input.active === false ? 0 : 1 };
}

export function listCoupons() {
  return getDatabase().prepare('SELECT * FROM coupons ORDER BY active DESC, created_at DESC').all().map(serializeCoupon);
}

export function getCoupon(id) {
  const row = getDatabase().prepare('SELECT * FROM coupons WHERE id = ?').get(id);
  if (!row) throw new AppError('Cupón no encontrado.', { status: 404, code: 'COUPON_NOT_FOUND' });
  return serializeCoupon(row);
}

export function createCoupon(input) {
  const code = text(input.code, 'code', { required: true, max: 40 }).toUpperCase();
  if (!/^[A-Z0-9_-]{3,40}$/.test(code)) throw new AppError('El código del cupón no es válido.', { code: 'VALIDATION_ERROR' });
  const row = normalize(input, code);
  const db = getDatabase();
  const result = transaction(() => {
    const inserted = db.prepare(`INSERT INTO coupons (code, name, discount_type, discount_value, minimum_subtotal_cents, maximum_discount_cents, starts_at, ends_at, max_uses, max_uses_per_customer, applies_to_all, stackable, active)
      VALUES (@code, @name, @discount_type, @discount_value, @minimum_subtotal_cents, @maximum_discount_cents, @starts_at, @ends_at, @max_uses, @max_uses_per_customer, @applies_to_all, @stackable, @active)`).run(row);
    replaceScopes(db, inserted.lastInsertRowid, input);
    return inserted.lastInsertRowid;
  });
  return getCoupon(result);
}

export function updateCoupon(id, input) {
  const current = getDatabase().prepare('SELECT * FROM coupons WHERE id = ?').get(id);
  if (!current) throw new AppError('Cupón no encontrado.', { status: 404, code: 'COUPON_NOT_FOUND' });
  const row = normalize({ ...current, ...input }, current.code);
  const db = getDatabase();
  transaction(() => {
    db.prepare(`UPDATE coupons SET name=@name, discount_type=@discount_type, discount_value=@discount_value, minimum_subtotal_cents=@minimum_subtotal_cents,
      maximum_discount_cents=@maximum_discount_cents, starts_at=@starts_at, ends_at=@ends_at, max_uses=@max_uses, max_uses_per_customer=@max_uses_per_customer,
      applies_to_all=@applies_to_all, stackable=@stackable, active=@active, updated_at=@updated_at WHERE id=@id`).run({ ...row, id });
    replaceScopes(db, id, input);
  });
  return getCoupon(id);
}

function normalize(input, code) {
  const type = oneOf(input.discountType, ['PERCENTAGE', 'FIXED'], 'discountType');
  const value = integer(input.discountValue, 'discountValue', { min: 1, max: type === 'PERCENTAGE' ? 100 : 100000000 });
  return {
    code,
    name: text(input.name, 'name', { max: 120 }),
    discount_type: type,
    discount_value: value,
    minimum_subtotal_cents: integer(input.minimumSubtotalCents ?? 0, 'minimumSubtotalCents', { min: 0 }),
    maximum_discount_cents: integer(input.maximumDiscountCents, 'maximumDiscountCents', { required: false, min: 1 }),
    starts_at: input.startsAt || null,
    ends_at: input.endsAt || null,
    max_uses: integer(input.maxUses, 'maxUses', { required: false, min: 1 }),
    max_uses_per_customer: integer(input.maxUsesPerCustomer, 'maxUsesPerCustomer', { required: false, min: 1 }),
    applies_to_all: input.appliesToAll === false ? 0 : 1,
    stackable: input.stackable ? 1 : 0,
    active: input.active === false ? 0 : 1,
    updated_at: new Date().toISOString()
  };
}

function replaceScopes(db, id, input) {
  db.prepare('DELETE FROM coupon_products WHERE coupon_id = ?').run(id);
  db.prepare('DELETE FROM coupon_categories WHERE coupon_id = ?').run(id);
  for (const productId of input.productIds || []) db.prepare('INSERT INTO coupon_products (coupon_id, inventory_product_id) VALUES (?, ?)').run(id, String(productId));
  for (const categoryId of input.categoryIds || []) db.prepare('INSERT INTO coupon_categories (coupon_id, category_id) VALUES (?, ?)').run(id, String(categoryId));
}

function serializeCoupon(row) {
  const db = getDatabase();
  return {
    id: row.id, code: row.code, name: row.name, discountType: row.discount_type, discountValue: row.discount_value,
    minimumSubtotal: row.minimum_subtotal_cents / 100, maximumDiscount: row.maximum_discount_cents === null ? null : row.maximum_discount_cents / 100,
    startsAt: row.starts_at, endsAt: row.ends_at, maxUses: row.max_uses, maxUsesPerCustomer: row.max_uses_per_customer,
    appliesToAll: Boolean(row.applies_to_all), stackable: Boolean(row.stackable), active: Boolean(row.active),
    productIds: db.prepare('SELECT inventory_product_id FROM coupon_products WHERE coupon_id = ?').all(row.id).map((item) => item.inventory_product_id),
    categoryIds: db.prepare('SELECT category_id FROM coupon_categories WHERE coupon_id = ?').all(row.id).map((item) => item.category_id)
  };
}
