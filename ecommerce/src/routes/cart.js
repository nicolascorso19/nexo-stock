import express from 'express';
import { requireCsrf } from '../lib/auth-guard.js';
import { getOrCreateCart, addCartItem, setCartItemQuantity, removeCartItem } from '../services/cart.js';
import { findVariant } from '../services/catalog-client.js';
import { quoteCart } from '../services/quote.js';
import { recordAnalytics } from '../services/analytics.js';
import { AppError } from '../lib/errors.js';

export function cartRouter({ config, catalogClient }) {
  const router = express.Router();
  router.use((req, res, next) => {
    req.cart = getOrCreateCart(req, res, config);
    next();
  });

  router.get('/', async (req, res) => {
    const cart = await cartWithQuote(req.cart, res, config, catalogClient);
    res.json({ data: cart });
  });

  router.post('/items', requireCsrf(config), async (req, res) => {
    const catalog = await catalogClient.getCatalog({ fresh: true });
    const variant = findVariant(catalog, req.body?.inventoryVariantId);
    if (!variant || variant.product?.published === false || variant.published === false) throw new AppError('El producto ya no está disponible.', { status: 409, code: 'PRODUCT_UNAVAILABLE' });
    // Un producto sin precio de venta registrado puede estar visible (catálogo
    // visual) pero no se puede comprar: sin precio no hay cotización válida, así
    // que se rechaza en el carrito en lugar de fallar recién en el checkout.
    if (variant.priceKnown === false || variant.price === null || variant.price === undefined) {
      throw new AppError('El producto todavía no tiene precio de venta publicado.', { status: 503, code: 'PRICE_NOT_REGISTERED', details: { variantId: variant.id } });
    }
    const available = Number(variant.availableQuantity || 0);
    if (available < 1) throw new AppError('El producto está agotado.', { status: 409, code: 'OUT_OF_STOCK' });
    // El carrito no puede superar lo disponible: la reserva real ocurre al
    // confirmar el pedido, pero el cliente se entera en el momento de agregar.
    const requested = Number(req.body?.quantity ?? 1);
    const alreadyInCart = Number(req.cart.items
      .filter((item) => String(item.inventory_variant_id) === String(variant.id))
      .reduce((sum, item) => sum + Number(item.quantity || 0), 0));
    if (alreadyInCart + requested > available) {
      throw new AppError(
        available - alreadyInCart > 0
          ? `Sólo quedan ${available - alreadyInCart} unidades disponibles de este producto.`
          : 'Este producto acaba de quedarse sin disponibilidad.',
        { status: 409, code: 'INSUFFICIENT_STOCK', details: { available, inCart: alreadyInCart } }
      );
    }
    const cart = addCartItem(req.cart, req.body);
    const result = await cartWithQuote(cart, res, config, catalogClient);
    recordAnalytics('ADD_TO_CART', { customerId: req.storeSession?.kind === 'customer' ? req.storeSession.id : null, productId: variant.product.id, variantId: variant.id, anonymousId: req.get('X-Anonymous-Id') || null });
    res.status(201).json({ data: result });
  });

  router.patch('/items/:itemId', requireCsrf(config), async (req, res) => {
    // Cambiar la cantidad también se valida contra el stock real, para que el
    // botón "+" no acepte más unidades de las que existen.
    const quantity = Number(req.body?.quantity ?? 0);
    if (quantity > 0) {
      const catalog = await catalogClient.getCatalog({ fresh: true });
      const item = req.cart.items.find((entry) => String(entry.id) === String(req.params.itemId));
      const variant = item ? findVariant(catalog, item.inventory_variant_id) : null;
      if (!variant) throw new AppError('El producto ya no está disponible.', { status: 409, code: 'PRODUCT_UNAVAILABLE' });
      const available = Number(variant.availableQuantity || 0);
      if (quantity > available) {
        throw new AppError(
          available > 0 ? `Sólo quedan ${available} unidades disponibles de este producto.` : 'Este producto acaba de quedarse sin disponibilidad.',
          { status: 409, code: 'INSUFFICIENT_STOCK', details: { available } }
        );
      }
    }
    const cart = setCartItemQuantity(req.cart, req.params.itemId, req.body);
    res.json({ data: await cartWithQuote(cart, res, config, catalogClient) });
  });

  router.delete('/items/:itemId', requireCsrf(config), async (req, res) => {
    const cart = removeCartItem(req.cart, req.params.itemId);
    res.json({ data: await cartWithQuote(cart, res, config, catalogClient) });
  });

  return router;
}

export async function cartWithQuote(cart, _res, config, catalogClient, options = {}) {
  if (!cart) return { id: null, items: [], quote: null, availability: { state: 'UNKNOWN', message: 'Tu carrito expiró. Volvé a agregar los productos.' }, version: 0, updatedAt: new Date().toISOString() };
  let quote = null;
  let availability = { state: 'UNKNOWN', message: 'Estamos verificando la disponibilidad.' };
  try {
    const catalog = await catalogClient.getCatalog({ fresh: options.fresh !== false });
    quote = quoteCart({ cart, catalog, couponCode: options.couponCode || '', customerId: options.customerId || cart.customer_id, fulfillmentMethod: options.fulfillmentMethod || 'PICKUP', locality: options.locality || '', postalCode: options.postalCode || '', config });
    availability = { state: 'OK', verifiedAt: quote.stock.verifiedAt, stale: quote.stock.stale };
  } catch (error) {
    availability = { state: 'UNKNOWN', code: error.code, message: error.message };
  }
  return { id: cart.id, items: cart.items.map((item) => ({ id: item.id, inventoryVariantId: item.inventory_variant_id, quantity: item.quantity })), quote, availability, version: cart.version, updatedAt: cart.updated_at };
}
