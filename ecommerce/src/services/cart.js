import { getDatabase, transaction } from '../db/database.js';
import { AppError } from '../lib/errors.js';
import { randomToken, hashToken } from '../lib/security.js';
import { integer } from '../lib/validation.js';
import { CART_COOKIE } from './auth.js';

function cookieOptions(config) {
  return { httpOnly: true, secure: config.cookieSecure, sameSite: 'lax', path: '/' };
}

export function getOrCreateCart(req, res, config, { create = true } = {}) {
  const db = getDatabase();
  const existingToken = req.cookies?.[CART_COOKIE];
  let cart = existingToken ? db.prepare("SELECT * FROM carts WHERE token_hash = ? AND status = 'ACTIVE' AND expires_at > ?").get(hashToken(existingToken), new Date().toISOString()) : null;
  if (cart && cart.customer_id && req.customerSession?.id && cart.customer_id !== req.customerSession.id) cart = null;
  if (!cart && create) {
    const token = randomToken(36);
    const expiresAt = new Date(Date.now() + config.cartTtlMs).toISOString();
    const result = db.prepare('INSERT INTO carts (token_hash, customer_id, expires_at) VALUES (?, ?, ?)').run(hashToken(token), req.customerSession?.id || null, expiresAt);
    res.cookie(CART_COOKIE, token, { ...cookieOptions(config), maxAge: config.cartTtlMs });
    cart = db.prepare('SELECT * FROM carts WHERE id = ?').get(result.lastInsertRowid);
  }
  return cart ? hydrateCart(cart) : null;
}

export function hydrateCart(cart) {
  if (!cart) return null;
  const items = getDatabase().prepare('SELECT id, inventory_variant_id, quantity, created_at, updated_at FROM cart_items WHERE cart_id = ? ORDER BY id').all(cart.id);
  return { ...cart, items };
}

export function attachCartSession(req) {
  const session = req.storeSession;
  req.customerSession = session?.kind === 'customer' ? session : null;
  return req.customerSession;
}

export function mergeCustomerCart(customerId, req, res, config) {
  const guestToken = req.cookies?.[CART_COOKIE];
  if (!guestToken) return getOrCreateCart(req, res, config);
  const db = getDatabase();
  const guestCart = db.prepare("SELECT * FROM carts WHERE token_hash = ? AND status = 'ACTIVE' AND expires_at > ?").get(hashToken(guestToken), new Date().toISOString());
  if (!guestCart) return getOrCreateCart(req, res, config);
  const customerCart = db.prepare("SELECT * FROM carts WHERE customer_id = ? AND status = 'ACTIVE' AND expires_at > ? ORDER BY updated_at DESC LIMIT 1").get(customerId, new Date().toISOString());
  transaction(() => {
    if (customerCart && customerCart.id !== guestCart.id) {
      const guestItems = db.prepare('SELECT * FROM cart_items WHERE cart_id = ?').all(guestCart.id);
      for (const item of guestItems) {
        db.prepare(`INSERT INTO cart_items (cart_id, inventory_variant_id, quantity) VALUES (?, ?, ?)
          ON CONFLICT(cart_id, inventory_variant_id) DO UPDATE SET quantity = MIN(99, quantity + excluded.quantity), updated_at = ?`).run(customerCart.id, item.inventory_variant_id, item.quantity, new Date().toISOString());
      }
      db.prepare("UPDATE carts SET status = 'MERGED' WHERE id = ?").run(guestCart.id);
    } else {
      db.prepare('UPDATE carts SET customer_id = ?, updated_at = ? WHERE id = ?').run(customerId, new Date().toISOString(), guestCart.id);
    }
  });
  return getOrCreateCart(req, res, config);
}

export function addCartItem(cart, input) {
  const variantId = String(input.inventoryVariantId ?? '').trim();
  if (!variantId) throw new AppError('La variante no es válida.', { code: 'VALIDATION_ERROR' });
  const quantity = integer(input.quantity ?? 1, 'quantity', { min: 1, max: 99 });
  const db = getDatabase();
  transaction(() => {
    db.prepare(`INSERT INTO cart_items (cart_id, inventory_variant_id, quantity) VALUES (?, ?, ?)
      ON CONFLICT(cart_id, inventory_variant_id) DO UPDATE SET quantity = MIN(99, quantity + excluded.quantity), updated_at = ?`).run(cart.id, variantId, quantity, new Date().toISOString());
    touchCart(cart.id);
  });
  return hydrateCart(db.prepare('SELECT * FROM carts WHERE id = ?').get(cart.id));
}

export function setCartItemQuantity(cart, itemId, input) {
  const quantity = integer(input.quantity, 'quantity', { min: 0, max: 99 });
  const db = getDatabase();
  const item = db.prepare('SELECT * FROM cart_items WHERE id = ? AND cart_id = ?').get(itemId, cart.id);
  if (!item) throw new AppError('El producto no está en el carrito.', { status: 404, code: 'CART_ITEM_NOT_FOUND' });
  transaction(() => {
    if (quantity === 0) db.prepare('DELETE FROM cart_items WHERE id = ?').run(item.id);
    else db.prepare('UPDATE cart_items SET quantity = ?, updated_at = ? WHERE id = ?').run(quantity, new Date().toISOString(), item.id);
    touchCart(cart.id);
  });
  return hydrateCart(db.prepare('SELECT * FROM carts WHERE id = ?').get(cart.id));
}

export function removeCartItem(cart, itemId) {
  const result = getDatabase().prepare('DELETE FROM cart_items WHERE id = ? AND cart_id = ?').run(itemId, cart.id);
  if (!result.changes) throw new AppError('El producto no está en el carrito.', { status: 404, code: 'CART_ITEM_NOT_FOUND' });
  touchCart(cart.id);
  return hydrateCart(getDatabase().prepare('SELECT * FROM carts WHERE id = ?').get(cart.id));
}

export function touchCart(cartId) {
  getDatabase().prepare('UPDATE carts SET updated_at = ?, version = version + 1 WHERE id = ?').run(new Date().toISOString(), cartId);
}

export function markCartConverted(cart, orderId) {
  getDatabase().prepare("UPDATE carts SET status = 'CONVERTED', converted_order_id = ?, updated_at = ? WHERE id = ?").run(orderId, new Date().toISOString(), cart.id);
}
