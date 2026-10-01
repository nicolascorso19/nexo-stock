/**
 * Estado del cliente.
 *
 * Un único objeto con los datos que la SPA necesita, y funciones que llaman a
 * la API y emiten el cambio. El carrito vive en el servidor: el navegador sólo
 * guarda identificadores, nunca precios ni stock propios.
 */
import { request, queryString } from './api.js';

export const state = {
  config: null,
  content: [],
  session: { authenticated: false, user: null },
  cart: { items: [], quote: null, availability: { state: 'UNKNOWN' } },
  catalog: { products: [], total: 0 },
  loading: true,
  route: location.pathname,
  selectedVariants: {},
  lastOrderToken: new URLSearchParams(location.search).get('token') || ''
};

const listeners = new Set();
export function subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); }
export function emit() { for (const listener of listeners) listener(state); }

export async function bootstrap() {
  state.loading = true;
  emit();
  const [session, config, cart] = await Promise.allSettled([
    request('/api/auth/session'),
    request('/api/storefront/config'),
    request('/api/cart')
  ]);
  if (session.status === 'fulfilled') state.session = session.value;
  if (config.status === 'fulfilled') { state.config = config.value.store; state.content = config.value.content || []; }
  if (cart.status === 'fulfilled') state.cart = cart.value;
  await loadCatalog();
  state.loading = false;
  emit();
}

/**
 * Catálogo. Filtros y orden se resuelven en el servidor para que la URL
 * describa exactamente lo que el cliente está viendo.
 */
export async function loadCatalog(filters = {}) {
  try {
    state.catalog = await request(`/api/storefront/catalog${queryString(filters)}`);
  } catch (error) {
    // Sin catálogo no se inventa nada: se marca como no disponible y la
    // interfaz avisa que está actualizando.
    state.catalog = { products: [], total: 0, unavailable: true, error: error.message, code: error.code };
  }
  emit();
}

export function navigate(path) {
  if (location.pathname + location.search === path) return;
  history.pushState({}, '', path);
  state.route = location.pathname;
  window.scrollTo({ top: 0, behavior: 'smooth' });
  // Las rutas públicas ya tienen su HTML en el servidor: se recarga para que
  // el usuario vea siempre la versión renderizada y los datos de stock reales.
  if (isServerRendered(path)) { window.location.assign(path); return; }
  renderRoute();
}

function isServerRendered(path) {
  const [pathname] = String(path).split('?');
  // /buscar se incluye porque el servidor lo redirige a /catalogo: sin esto la
  // SPA lo pintaba con el catálogo entero, sin aplicar la consulta.
  return pathname === '/' || pathname === '/catalogo' || pathname === '/buscar' || pathname.startsWith('/producto/') || pathname.startsWith('/categoria/');
}

export async function renderRoute() {
  if (state.route === '/carrito' || state.route === '/checkout') await refreshCart();
  emit();
}

export async function refreshCart() {
  try { state.cart = await request('/api/cart'); } catch (error) { state.cart.availability = { state: 'UNKNOWN', message: error.message }; }
  emit();
}

export async function addToCart(variantId, quantity = 1) {
  const result = await request('/api/cart/items', { method: 'POST', body: { inventoryVariantId: variantId, quantity } });
  state.cart = result;
  emit();
  return result;
}

export async function updateCartItem(itemId, quantity) {
  state.cart = await request(`/api/cart/items/${encodeURIComponent(itemId)}`, { method: 'PATCH', body: { quantity } });
  emit();
}

export async function removeCartItem(itemId) {
  state.cart = await request(`/api/cart/items/${encodeURIComponent(itemId)}`, { method: 'DELETE' });
  emit();
}

export function quoteCheckout(input) {
  return request('/api/checkout/quote', { method: 'POST', body: input });
}

/** El Idempotency-Key viaja en el cuerpo y en la cabecera: un doble clic no
 *  puede crear dos pedidos. */
export async function createOrder(input) {
  const key = crypto.randomUUID();
  return request('/api/checkout/orders', { method: 'POST', body: { ...input, idempotencyKey: key }, idempotencyKey: key });
}

export async function login(input) { await request('/api/auth/login', { method: 'POST', body: input }); state.session = await request('/api/auth/session'); emit(); }
export async function register(input) { await request('/api/auth/register', { method: 'POST', body: input }); state.session = await request('/api/auth/session'); emit(); }
export async function logout() { await request('/api/auth/logout', { method: 'POST' }); state.session = { authenticated: false, user: null }; emit(); }

export function variantFor(product, variantId) {
  return product?.variants?.find((variant) => String(variant.id) === String(variantId));
}

export function selectedVariantId(product) {
  const chosen = state.selectedVariants?.[product?.id];
  if (chosen && variantFor(product, chosen)) return chosen;
  const firstAvailable = (product?.variants || []).find((variant) => variant.availability !== 'OUT');
  return firstAvailable?.id || product?.variants?.[0]?.id;
}

export function setSelectedVariant(productId, variantId) {
  state.selectedVariants = { ...state.selectedVariants, [productId]: variantId };
}

export function currentUser() { return state.session.user; }
