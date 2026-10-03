/**
 * Arranque de la tienda en el navegador.
 *
 * Acá vive el enrutado del cliente, el ciclo de render y los handlers de
 * eventos. El contenido de cada pantalla está en views.js, product.js y
 * checkout.js; las piezas compartidas, en ui.js.
 */
import { request, debounce } from './api.js';
import { state, bootstrap, subscribe, navigate, loadCatalog, refreshCart, addToCart, updateCartItem, removeCartItem, quoteCheckout, createOrder, login, register, logout, variantFor, selectedVariantId, setSelectedVariant } from './store.js';
import { initAnalytics, pageView, track, trackCommerce } from './analytics.js';
import { whatsappLink } from './whatsapp.js';
import { escape, whatsappFab, hasWhatsapp, initials, statusClass } from './ui.js';
import { homeView, catalogView, cartView, checkoutView, authView, accountView, orderView, adminView, routeNotFound, confirmationMarkup, loadCustomerOrders, loadAdmin } from './views.js';
import { productView } from './product.js';

const app = document.querySelector('#app');
const toastRegion = document.querySelector('#toast-region');
let checkoutDraft = { couponCode: '', quote: null, acceptPriceChanges: false };
let adminState = { dashboard: null, orders: [], settings: null, coupons: [] };
let catalogRequest = null;
let catalogSignature = '';

/* ------------------------------------------------------------------ avisos */

function toast(message, type = 'info') {
  const node = document.createElement('div');
  node.className = `toast ${type}`;
  node.textContent = message;
  toastRegion.append(node);
  setTimeout(() => node.remove(), 4800);
}

function setMeta(title, description) {
  document.title = title || state.config?.brandName || 'NEXO Tech';
  const meta = document.querySelector('meta[name="description"]');
  if (meta) meta.setAttribute('content', description || state.config?.seo?.description || 'Celulares, iPhone, Apple y accesorios seleccionados.');
}

/* ----------------------------------------------------------------- cabecera */

function header() {
  const user = state.session.user;
  const cartCount = state.cart?.items?.reduce((sum, item) => sum + Number(item.quantity || 0), 0) || 0;
  const active = (path) => (location.pathname === path ? ' aria-current="page"' : '');
  const categories = catalogFacets().categories;
  return `<header class="site-header">
    <div class="header-inner">
      <a class="logo" href="/" data-link><img class="logo-image" src="/img/logo-chascell.png" width="893" height="639" alt="Chascell" /><span class="logo-text">${escape(state.config?.brandName || 'Chascell')}</span></a>
      <nav class="main-nav" aria-label="Navegación principal">
        <a href="/" data-link${active('/')}>Inicio</a>
        <a href="/catalogo?category=Celulares" data-link${active('/catalogo')}>iPhone</a>
        <a href="/catalogo?category=Accesorios" data-link>Accesorios</a>
        <a href="/catalogo?availability=in" data-link>Disponibles</a>
        <a href="/catalogo?sort=offers" data-link>Ofertas</a>
        ${categories.filter((category) => category !== 'Celulares' && category !== 'Accesorios').slice(0, 2)
          .map((category) => `<a href="/catalogo?category=${encodeURIComponent(category)}" data-link>${escape(category)}</a>`).join('')}
      </nav>
      <div class="header-tools">
        <form class="search-mini" data-search-form role="search">
          <label class="sr-only" for="header-search">Buscar productos</label>
          <input id="header-search" name="q" aria-label="Buscar productos" placeholder="Buscar" value="${escape(new URLSearchParams(location.search).get('q') || '')}">
        </form>
        ${user ? `<a class="icon-button" href="/cuenta" aria-label="Mi cuenta">${escape(initials(user.name))}</a>` : '<a class="icon-button" href="/login" aria-label="Iniciar sesión" aria-hidden="true"><span aria-hidden="true">♙</span></a>'}
        <a class="icon-button cart-button" href="/carrito" aria-label="Carrito con ${cartCount} productos"><span aria-hidden="true">🛒</span>${cartCount ? `<span class="cart-count" aria-hidden="true">${cartCount > 99 ? '99+' : cartCount}</span>` : ''}</a>
        <button class="menu-button" data-action="toggle-menu" aria-label="Abrir menú" aria-expanded="false" aria-controls="mobile-nav"><span aria-hidden="true">☰</span></button>
      </div>
    </div>
    <nav class="mobile-nav" id="mobile-nav" data-mobile-nav aria-label="Navegación móvil">
      <form class="search-mini" data-search-form role="search">
        <label class="sr-only" for="mobile-search">Buscar productos</label>
        <input id="mobile-search" name="q" aria-label="Buscar productos" placeholder="Buscar productos" value="${escape(new URLSearchParams(location.search).get('q') || '')}">
      </form>
      <a href="/" data-link>Inicio</a>
      <a href="/catalogo" data-link>Comprar</a>
      <a href="/catalogo?availability=in" data-link>Disponibles ahora</a>
      <a href="/catalogo?sort=offers" data-link>Ofertas</a>
      <a href="/cuenta" data-link>Mi cuenta</a>
      ${user ? '<button data-action="logout">Cerrar sesión</button>' : '<a href="/login" data-link>Ingresar</a>'}
    </nav>
  </header>`;
}

function footer() {
  const store = state.config || {};
  const facets = catalogFacets();
  const whatsapp = whatsappLink({ message: 'Hola, tengo una consulta.', config: store });
  return `<footer class="site-footer"><div class="container">
    <div class="footer-grid">
      <div>
        <a class="logo" href="/" data-link><img class="logo-image" src="/img/logo-chascell.png" width="893" height="639" alt="Chascell" /><span class="logo-text">${escape(store.brandName || 'Chascell')}</span></a>
        <p>${escape(store.seo?.description || 'Equipos seleccionados. Compra segura. Atención personalizada.')}</p>
      </div>
      <div><p class="footer-title">Comprar</p>
        <a href="/catalogo" data-link>Todos los productos</a><br>
        <a href="/catalogo?availability=in" data-link>Disponibles ahora</a><br>
        <a href="/catalogo?sort=offers" data-link>Ofertas</a><br>
        <a href="/carrito" data-link>Mi carrito</a>
      </div>
      <div><p class="footer-title">Categorías</p>
        ${facets.categories.slice(0, 5).map((category) => `<a href="/catalogo?category=${encodeURIComponent(category)}" data-link>${escape(category)}</a><br>`).join('')}
      </div>
      <div><p class="footer-title">Ayuda</p>
        <a href="/cuenta" data-link>Mis pedidos</a><br>
        <a href="/recuperar" data-link>Recuperar acceso</a><br>
        <a href="/checkout" data-link>Checkout seguro</a>
      </div>
      <div><p class="footer-title">Contacto</p>
        ${store.supportEmail ? `<p>${escape(store.supportEmail)}</p>` : ''}
        ${whatsapp ? `<p><a href="${escape(whatsapp)}" target="_blank" rel="noopener noreferrer">WhatsApp</a></p>` : ''}
        <p>${escape(store.address?.locality || 'Córdoba Capital')}</p>
      </div>
    </div>
    <div class="footer-bottom">
      <span>© ${new Date().getFullYear()} ${escape(store.brandName || 'NEXO Tech')}</span>
      <span>Pagos procesados de forma segura · No guardamos datos de tarjetas</span>
    </div>
  </div></footer>`;
}

/* ------------------------------------------------------------------ facetas */

/** Valores posibles de los filtros, derivados del catálogo ya cargado. */
function catalogFacets() {
  const products = state.catalog.products || [];
  const unique = (values) => [...new Set(values.filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), 'es'));
  return {
    categories: unique(products.map((product) => product.category)),
    brands: unique(products.map((product) => product.brand)),
    models: unique(products.map((product) => product.model)),
    conditions: unique(products.map((product) => product.condition)),
    capacities: unique(products.flatMap((product) => product.variants.map((variant) => variant.capacity))),
    colors: unique(products.flatMap((product) => product.variants.map((variant) => variant.color)))
  };
}

/* ----------------------------------------------------------------- render */

function render() {
  if (state.loading) {
    app.innerHTML = '<div class="boot-screen"><div class="brand-mark">N</div><p>Cargando la experiencia...</p></div>';
    return;
  }
  const route = location.pathname;
  const facets = catalogFacets();
  let content;

  if (route === '/') content = homeView({
    hero: state.content.find((item) => item.block_type === 'HERO') || {},
    products: state.catalog.products || [],
    categories: facets.categories.map((name) => ({ name, count: (state.catalog.products || []).filter((product) => product.category === name).length })),
    unavailable: Boolean(state.catalog.unavailable)
  });
  else if (route === '/catalogo' || route === '/buscar' || route.startsWith('/categoria/')) content = catalogView({ params: catalogParams(), products: state.catalog.products || [], total: state.catalog.total || 0, unavailable: Boolean(state.catalog.unavailable), facets });
  else if (route.startsWith('/producto/')) content = productRoute(route.split('/')[2]);
  else if (route === '/carrito') content = cartView({ cart: state.cart || {} });
  else if (route === '/checkout') content = checkoutView({ cart: state.cart, config: state.config, draft: checkoutDraft });
  else if (route === '/login' || route === '/registro' || route === '/recuperar') content = authView(route);
  else if (route === '/cuenta') content = accountView({ user: state.session.user, authenticated: state.session.authenticated });
  else if (route.startsWith('/pedido/')) content = orderView(route.split('/')[2]);
  else if (route === '/admin') content = adminView({ adminState, user: state.session.user });
  else content = routeNotFound();

  app.innerHTML = `${header()}<main id="main-content">${content}</main>${footer()}${hasWhatsapp(state.config) && ['/', '/catalogo', '/buscar'].includes(route) ? whatsappFab(state.config) : ''}`;
  bindDynamic();
}

function catalogParams() {
  const params = new URLSearchParams(location.search);
  if (location.pathname.startsWith('/categoria/') && !params.get('category')) {
    params.set('category', decodeURIComponent(location.pathname.split('/')[2] || ''));
  }
  return params;
}

function productRoute(slug) {
  const id = decodeURIComponent(slug || '');
  const product = (state.catalog.products || []).find((item) => String(item.slug || item.id) === id);
  if (!product) {
    return `<div class="container"><div class="empty-state mt-20">
      <h3>Producto no encontrado</h3>
      <p>Puede haber cambiado la publicación o el catálogo no está disponible.</p>
      <a class="btn btn-primary" href="/catalogo" data-link>Volver al catálogo</a></div></div>`;
  }
  const selected = variantFor(product, selectedVariantId(product)) || (product.variants || [])[0];
  setMeta(`${product.name} | ${state.config?.brandName || 'NEXO Tech'}`, product.description || `Comprar ${product.name} en ${state.config?.brandName || 'NEXO Tech'}.`);
  return productView(product, selected);
}

/* ------------------------------------------------------- eventos de página */

function bindDynamic() {
  document.querySelectorAll('[data-link]').forEach((link) => {
    link.addEventListener('click', (event) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
      event.preventDefault();
      navigate(link.getAttribute('href'));
    });
  });
  document.querySelectorAll('[data-search-form]').forEach((form) => {
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const query = new FormData(form).get('q');
      if (query) track('search', { query: String(query) });
      // Directo al catálogo: es la misma búsqueda y evita un salto extra.
      navigate(`/catalogo${query ? `?q=${encodeURIComponent(query)}` : ''}`);
    });
  });
  document.querySelectorAll('[data-filter-sort]').forEach((select) => {
    select.addEventListener('change', () => {
      const params = catalogParams();
      if (select.value === 'relevance') params.delete('sort'); else params.set('sort', select.value);
      navigate(`/catalogo?${params}`);
    });
  });
}

/* ------------------------------------------------------------------ clicks */

async function handleClick(event) {
  const target = event.target.closest('[data-action]');
  const action = target?.dataset.action;
  const link = event.target.closest('[data-link]');
  if (link && !action) {
    if (event.metaKey || event.ctrlKey || event.shiftKey) return;
    event.preventDefault();
    navigate(link.getAttribute('href'));
    return;
  }
  if (!action) return;
  try {
    if (action === 'toggle-menu') {
      const nav = document.querySelector('[data-mobile-nav]');
      const open = nav?.classList.toggle('open');
      target.setAttribute('aria-expanded', String(Boolean(open)));
      return;
    }
    if (action === 'logout') { await logout(); toast('Sesión cerrada.', 'success'); navigate('/'); return; }
    if (action === 'select-variant') { selectVariant(target); return; }
    if (action === 'add-product') { await addSelectedProduct(target); return; }
    if (action === 'cart-qty') { await changeQuantity(target); return; }
    if (action === 'remove-cart') { await removeCartItem(target.dataset.itemId); toast('Producto quitado.', 'success'); return; }
    if (action === 'clear-cart') { await clearCart(); return; }
    if (action === 'load-customer-orders') { await loadCustomerOrders(); return; }
    if (action === 'load-admin') { await loadAdmin(() => { adminState = { ...adminState, ...arguments[0] }; render(); }); return; }
    if (action === 'cancel-order') { await cancelOrder(target); return; }
  } catch (error) { handleActionError(error); }
}

function selectVariant(target) {
  const product = (state.catalog.products || []).find((item) => String(item.id) === String(target.dataset.productId));
  const variant = variantFor(product, target.dataset.variantId);
  if (!product || !variant) return;
  setSelectedVariant(product.id, variant.id);
  render();
  trackCommerce({ action: 'view_item', product, variant });
  if (variant.availability === 'OUT') trackCommerce({ action: 'out_of_stock', product, variant });
}

async function addSelectedProduct(target) {
  const product = (state.catalog.products || []).find((item) => String(item.id) === String(target.dataset.productId));
  const variant = variantFor(product, target.dataset.variantId);
  if (!variant) throw new Error('Elegí una variante antes de continuar.');
  if (variant.availability === 'OUT') throw new Error('Este producto acaba de quedarse sin disponibilidad.');
  // El id de variante es un texto: convertirlo a número lo vuelve inválido.
  const result = await addToCart(variant.id);
  trackCommerce({ action: 'add_to_cart', product, variant, quantity: 1, value: Number(variant.price || 0) });
  const unavailable = result?.availability?.state && result.availability.state !== 'OK';
  toast(unavailable ? 'Agregado, pero estamos verificando la disponibilidad.' : 'Agregado al carrito.', unavailable ? 'info' : 'success');
}

async function changeQuantity(target) {
  const item = (state.cart.items || []).find((entry) => String(entry.id) === String(target.dataset.itemId));
  if (!item) return;
  const delta = Number(target.dataset.delta);
  const next = Number(item.quantity || 1) + delta;
  if (next < 1) { await removeCartItem(item.id); toast('Producto quitado.', 'success'); return; }
  try {
    await updateCartItem(item.id, next);
  } catch (error) {
    // El servidor es la autoridad: si la cantidad supera el stock disponible,
    // se muestra su mensaje en lugar de un total inventado.
    toast(error.message, 'error');
  }
}

async function clearCart() {
  const items = [...(state.cart.items || [])];
  for (const item of items) {
    try { await removeCartItem(item.id); } catch { /* seguimos limpiando el resto */ }
  }
  toast('Carrito vacío.', 'success');
}

async function cancelOrder(target) {
  const reason = window.prompt('Indicá el motivo de la cancelación');
  if (!reason) return;
  await request(`/api/checkout/orders/${encodeURIComponent(target.dataset.orderNumber)}/cancel`, {
    method: 'POST',
    body: { reason, token: target.dataset.orderToken }
  });
  toast('Pedido cancelado. La reserva se liberó.', 'success');
  await loadOrder(target.dataset.orderNumber, target.dataset.orderToken);
}

/* ----------------------------------------------------------------- submits */

async function handleSubmit(event) {
  const form = event.target.closest('[data-form]');
  if (!form) return;
  event.preventDefault();
  const data = Object.fromEntries(new FormData(form).entries());
  const type = form.dataset.form;
  try {
    if (type === 'login') { await login(data); toast('Sesión iniciada.', 'success'); navigate('/cuenta'); return; }
    if (type === 'register') { await register(data); toast('Cuenta creada.', 'success'); navigate('/cuenta'); return; }
    if (type === 'recover') { await request('/api/auth/password-reset/request', { method: 'POST', body: { email: data.email } }); toast('Si el email existe, te enviaremos un enlace.', 'success'); return; }
    if (type === 'admin-login') { await request('/api/admin/auth/login', { method: 'POST', body: data }); state.session = await request('/api/admin/auth/session'); await loadAdmin((next) => { adminState = next; render(); }); return; }
    if (type === 'admin-settings') { await request('/api/admin/settings', { method: 'PATCH', body: data }); toast('Configuración guardada.', 'success'); state.config = (await request('/api/storefront/config')).store; await loadAdmin((next) => { adminState = next; render(); }); return; }
    if (type === 'admin-content') { await request('/api/admin/content', { method: 'PUT', body: data }); toast('Contenido guardado.', 'success'); await loadAdmin((next) => { adminState = next; render(); }); return; }
    if (type === 'admin-merch') { await request(`/api/admin/merchandising/${encodeURIComponent(data.productId)}`, { method: 'PATCH', body: data }); toast('Producto actualizado.', 'success'); return; }
    if (type === 'admin-status') { await request(`/api/admin/orders/${encodeURIComponent(data.orderId)}/status`, { method: 'PATCH', body: data }); toast('Estado actualizado.', 'success'); await loadAdmin((next) => { adminState = next; render(); }); return; }
    if (type === 'admin-payment') { await request(`/api/admin/orders/${encodeURIComponent(data.orderId)}/payment/confirm`, { method: 'POST', body: data }); toast('Pago confirmado y stock confirmado en el sistema de stock.', 'success'); await loadAdmin((next) => { adminState = next; render(); }); return; }
    if (type === 'coupon') { await applyCoupon(data.code); return; }
    if (type === 'price-filter') { await applyPriceFilter(data); return; }
    if (type === 'back-stock') { await request('/api/storefront/back-stock', { method: 'POST', body: { inventoryVariantId: form.dataset.variantId, email: data.email } }); toast('Te avisaremos cuando vuelva a estar disponible.', 'success'); form.reset(); return; }
    if (type === 'checkout') { await submitCheckout(data); return; }
  } catch (error) { handleActionError(error); }
}

async function applyCoupon(code) {
  const draft = checkoutDraft;
  const result = await quoteCheckout({ couponCode: code, fulfillmentMethod: draft.fulfillmentMethod || 'PICKUP', address: draft.address || {} });
  checkoutDraft = { ...draft, couponCode: code, quote: result.quote };
  toast('Cupón aplicado.', 'success');
  render();
}

async function applyPriceFilter(data) {
  const params = new URLSearchParams(data.keep || '');
  if (data.maxPrice) params.set('maxPrice', data.maxPrice); else params.delete('maxPrice');
  navigate(`/catalogo?${params}`);
}

async function submitCheckout(data) {
  const draft = {
    ...checkoutDraft,
    ...data,
    address: {
      ...(checkoutDraft.address || {}),
      ...(data.fulfillmentMethod === 'SHIPPING'
        ? { street: data.street, number: data.number, floor: data.floor, apartment: data.apartment, locality: data.locality, province: data.province, postalCode: data.postalCode }
        : {})
    },
    acceptPriceChanges: data.acceptPriceChanges === 'on'
  };
  if (!draft.paymentMethod) throw new Error('Elegí un medio de pago.');
  checkoutDraft = draft;

  const previousHash = draft.quote?.quoteHash;
  const quoteResult = await quoteCheckout({ couponCode: draft.couponCode, fulfillmentMethod: draft.fulfillmentMethod, address: draft.address });
  checkoutDraft.quote = quoteResult.quote;
  // Si el precio cambió entre la cotización y el clic, se pide confirmación
  // explícita en lugar de cobrar el valor nuevo sin avisar.
  if (!draft.acceptPriceChanges && previousHash && quoteResult.quote.quoteHash !== previousHash) {
    checkoutDraft.acceptPriceChanges = false;
    toast('El precio cambió. Revisá el total actualizado antes de confirmar.', 'error');
    render();
    return;
  }

  trackCommerce({ action: 'begin_checkout', value: Number(quoteResult.quote.totalCents || 0) / 100 });
  const result = await createOrder({ ...draft, quoteToken: quoteResult.quote.quoteToken, acceptPriceChanges: true });
  if (result.payment?.checkoutUrl) { window.location.href = result.payment.checkoutUrl; return; }
  trackCommerce({ action: 'purchase', order: result.order });
  navigate(`/pedido/${encodeURIComponent(result.order.number)}?token=${encodeURIComponent(result.publicToken)}`);
}

function handleActionError(error) {
  if (error.code === 'PRICE_CHANGED' && error.details?.quote) {
    checkoutDraft = { ...checkoutDraft, quote: error.details.quote, acceptPriceChanges: false };
    toast('El precio cambió. Revisá y aceptá el total actualizado.', 'error');
    render();
    return;
  }
  if (error.code === 'STOCK_API_UNAVAILABLE' || error.code === 'STOCK_AVAILABILITY_UNKNOWN') {
    state.cart.availability = { state: 'UNKNOWN', message: error.message };
  }
  toast(error.message || 'No se pudo completar la operación.', 'error');
}

/* ------------------------------------------------------ carga de datos */

async function loadOrder(number, token) {
  const container = document.querySelector('#order-confirmation');
  if (!container) return;
  try {
    const order = await request(`/api/checkout/orders/${encodeURIComponent(number)}${token ? `?token=${encodeURIComponent(token)}` : ''}`);
    container.innerHTML = confirmationMarkup(order, token);
  } catch (error) {
    container.innerHTML = `<div class="notice error">${escape(error.message)}</div>`;
  }
}

async function loadRouteData() {
  if (location.pathname === '/cuenta' && state.session.authenticated) await loadCustomerOrders();
  if (location.pathname.startsWith('/pedido/')) {
    const segment = decodeURIComponent(location.pathname.split('/')[2] || '');
    const token = new URLSearchParams(location.search).get('token') || state.lastOrderToken;
    state.lastOrderToken = token || '';
    // Mercado Pago y los medios de retorno apuntan a /pedido/confirmacion, así
    // que el segmento no es un número de pedido. El token de invitado es
    // "<número>.<firma>", así que el número se recupera de ahí en lugar de
    // pedirle un pedido inexistente llamado "confirmacion".
    const number = /^ORD-/i.test(segment) ? segment : String(token || '').split('.')[0];
    if (number) await loadOrder(number, token);
    else {
      const container = document.querySelector('#order-confirmation');
      if (container) container.innerHTML = '<div class="notice error">No pudimos identificar el pedido. Revisá el enlace del correo o tu cuenta.</div>';
    }
  }
  if (location.pathname === '/admin' && state.session.user?.kind === 'admin') {
    await loadAdmin((next) => { adminState = next; render(); });
  }
  if (location.pathname === '/checkout' && state.cart?.items?.length) {
    try {
      const result = await quoteCheckout({ couponCode: checkoutDraft.couponCode, fulfillmentMethod: checkoutDraft.fulfillmentMethod || 'PICKUP', address: checkoutDraft.address || {} });
      checkoutDraft.quote = result.quote;
    } catch { /* el resumen ya avisa que falta verificar */ }
  }
}

/** Recarga el catálogo sólo si cambiaron los filtros, para no repetir pedidos. */
function catalogQuery() {
  const params = catalogParams();
  const maxPrice = Number(params.get('maxPrice'));
  return { ...Object.fromEntries(params.entries()), ...(Number.isFinite(maxPrice) && maxPrice > 0 ? { maxPrice } : {}) };
}

const reloadCatalog = debounce(async () => {
  const query = catalogQuery();
  const signature = JSON.stringify(query);
  if (signature === catalogSignature) return;
  catalogSignature = signature;
  if (!catalogRequest) {
    catalogRequest = loadCatalog(query).finally(() => { catalogRequest = null; });
    await catalogRequest;
  }
}, 60);

/* ------------------------------------------------------------- ciclo de vida */

// Cada cambio de ruta pinta la vista y pide lo que esa vista necesita
// (pedido, historial, panel). Sin esto, navegar dentro de la tienda dejaba
// esqueletos vacíos.
let lastRoute = state.route;
subscribe(() => {
  if (state.loading) return;
  render();
  if (state.route === lastRoute) return;
  lastRoute = state.route;
  loadRouteData();
});

window.addEventListener('popstate', () => { window.location.reload(); });
window.addEventListener('click', handleClick);
document.addEventListener('submit', handleSubmit);
document.addEventListener('change', (event) => {
  if (event.target.name === 'fulfillmentMethod') {
    checkoutDraft = { ...checkoutDraft, fulfillmentMethod: event.target.value, quote: null };
    render();
  }
  if (event.target.name === 'createAccount') {
    checkoutDraft = { ...checkoutDraft, createAccount: event.target.checked };
  }
});
window.addEventListener('focus', () => { if (state.cart?.items?.length) refreshCart(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden && state.cart?.items?.length) refreshCart(); });

(async () => {
  await bootstrap();
  initAnalytics(state.config);
  // Se renderiza la vista que el servidor ya envió y luego se hidrata.
  render();
  const query = catalogQuery();
  catalogSignature = JSON.stringify(query);
  if (['/catalogo', '/buscar'].includes(location.pathname) || location.pathname.startsWith('/categoria/')) {
    if (state.catalog.unavailable) await reloadCatalog();
  }
  pageView();
  loadRouteData();
  trackCommerceView();
  // Tras la hidratación, la URL de la página conserva los datos que el
  // servidor ya renderizó: no se vuelve a pedir el catálogo salvo que falte.
  if (['/catalogo', '/buscar'].includes(location.pathname) || location.pathname.startsWith('/categoria/')) {
    const params = catalogParams();
    if (params.toString() !== new URLSearchParams(location.search).toString()) history.replaceState({}, '', `/catalogo?${params}`);
  }
})();

/** Registra la vista de producto con la variante que quedó preseleccionada. */
function trackCommerceView() {
  if (!location.pathname.startsWith('/producto/')) return;
  const slug = decodeURIComponent(location.pathname.split('/')[2] || '');
  const product = (state.catalog.products || []).find((item) => String(item.slug || item.id) === slug);
  if (!product) return;
  const variant = variantFor(product, selectedVariantId(product)) || (product.variants || [])[0];
  trackCommerce({ action: 'view_item', product, variant });
  if (variant?.availability === 'OUT') trackCommerce({ action: 'out_of_stock', product, variant });
}

