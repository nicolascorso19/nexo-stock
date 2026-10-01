/**
 * Analítica.
 *
 * Envía los eventos a Google Analytics 4 y Meta Pixel cuando hay credenciales,
 * y siempre al endpoint propio para tener métricas aunque no haya etiquetas de
 * terceros. Los identificadores se configuran desde la tabla store_content o el
 * panel; sin ellos la tienda funciona igual, simplemente no reporta.
 *
 * Nunca se envían datos personales: ni email, ni teléfono, ni DNI, ni nombre.
 */

const GA_KEYS = ['gaMeasurementId', 'googleAnalyticsId', 'gtagId'];
const PIXEL_KEYS = ['metaPixelId', 'facebookPixelId', 'pixelId'];

const state = {
  gaId: '',
  pixelId: '',
  anonymousId: readAnonymousId(),
  sessionId: '',
  loaded: false,
  queue: []
};

function readAnonymousId() {
  const key = 'nexo_analytics_id';
  try {
    let value = localStorage.getItem(key);
    if (!value) {
      value = (crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`);
      localStorage.setItem(key, value);
    }
    return value;
  } catch {
    return 'anon';
  }
}

function pick(source, keys) {
  for (const key of keys) {
    const value = source?.[key];
    if (value) return String(value);
  }
  return '';
}

/** Se llama una vez con la configuración pública del servidor. */
export function initAnalytics(config = {}) {
  state.gaId = pick(config, GA_KEYS);
  state.pixelId = pick(config, PIXEL_KEYS);
  state.sessionId = readSessionId();

  if (state.gaId && !state.loaded) {
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(state.gaId)}`;
    document.head.append(script);
    window.dataLayer = window.dataLayer || [];
    window.gtag = function gtag() { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', state.gaId, { anonymize_ip: true, send_page_view: false });
    state.loaded = true;
  }

  if (state.pixelId && !window.fbq) {
    /* eslint-disable no-bitwise */
    !function(f,b,e,v,n,t,s)
    {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
    n.callMethod.apply(n,arguments):n.queue.push(arguments)};
    if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
    n.queue=[];t=b.createElement(e);t.async=!0;
    t.src=v;s=b.getElementsByTagName(e)[0];
    s.parentNode.insertBefore(t,s)}(window,document,'script',
    'https://connect.facebook.net/en_US/fbevents.js');
    /* eslint-enable no-bitwise */
    window.fbq('init', state.pixelId);
  }

  // La cola anterior se entrega ya con las etiquetas cargadas. El page_view lo
  // emite la aplicación después de renderizar, para que capture el título real.
  for (const event of state.queue.splice(0)) deliver(event);
}

function readSessionId() {
  const key = 'nexo_analytics_session';
  try {
    const existing = sessionStorage.getItem(key);
    if (existing) return existing;
    const value = (crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`);
    sessionStorage.setItem(key, value);
    return value;
  } catch {
    return 'session';
  }
}

export function pageView() {
  send('page_view', { page_location: location.href, page_path: location.pathname, page_title: document.title });
}

/**
 * Traduce un evento interno a los nombres que exigen GA4 y Meta Pixel.
 */
const MAP = {
  view_item: { ga: 'view_item', meta: 'ViewContent' },
  search: { ga: 'search', meta: 'Search' },
  add_to_cart: { ga: 'add_to_cart', meta: 'AddToCart' },
  begin_checkout: { ga: 'begin_checkout', meta: 'InitiateCheckout' },
  purchase: { ga: 'purchase', meta: 'Purchase' },
  out_of_stock: { ga: 'select_item', meta: 'ViewContent' }
};

export function track(name, payload = {}) {
  const mapping = MAP[name] || { ga: name, meta: name };
  const money = (value) => Number(value || 0);

  if (state.gaId && window.gtag) {
    const params = { ...payload, currency: 'USD' };
    if (payload.value !== undefined) params.value = money(payload.value);
    if (payload.items) params.items = payload.items;
    window.gtag('event', mapping.ga, params);
  }
  if (state.pixelId && window.fbq) {
    const params = {};
    if (payload.value !== undefined) params.value = money(payload.value);
    if (payload.currency) params.currency = payload.currency;
    if (payload.content_ids) params.content_ids = payload.content_ids;
    if (payload.content_name) params.content_name = payload.content_name;
    if (payload.content_type) params.content_type = payload.content_type;
    if (payload.num_items) params.num_items = payload.num_items;
    window.fbq('track', mapping.meta, params);
  }

  // Métricas propias: siempre activas, sin datos personales.
  send(name, { ...payload, anonymousId: state.anonymousId, sessionId: state.sessionId });
}

/* Eventos que guardamos en la base de la tienda, con su nombre persistido.
 * `purchase` no aparece: la compra se registra en el servidor al confirmar el
 * pedido (ORDER_COMPLETED), que es la única fuente que no se puede falsear. */
const SERVER_EVENTS = {
  page_view: 'VISIT',
  view_item: 'PRODUCT_VIEW',
  search: 'SEARCH',
  add_to_cart: 'ADD_TO_CART',
  remove_from_cart: 'REMOVE_FROM_CART',
  begin_checkout: 'CHECKOUT_STARTED',
  checkout_error: 'CHECKOUT_ABANDONED',
  out_of_stock: 'OUT_OF_STOCK'
};

function send(name, detail) {
  const event = SERVER_EVENTS[name];
  if (!event) return;
  const csrf = readCookie('nexo_store_csrf');
  fetch('/api/storefront/analytics', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(csrf ? { 'X-CSRF-Token': decodeURIComponent(csrf) } : {}) },
    body: JSON.stringify({
      event,
      anonymousId: detail.anonymousId,
      sessionId: detail.sessionId,
      productId: detail.productId || null,
      variantId: detail.variantId || null,
      query: detail.query || null
    }),
    keepalive: true
  }).catch(() => { /* la analítica nunca debe romper la tienda */ });
}

function readCookie(name) {
  return document.cookie.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.split('=').slice(1).join('=') || '';
}

/** Eventos de comercio con la forma que exigen GA4 y Meta. */
export function trackCommerce({ action, product, variant, quantity = 1, value = 0, order }) {
  const item = product ? {
    item_id: variant?.sku || product.id,
    item_name: product.name,
    ...(product.brand ? { item_brand: product.brand } : {}),
    ...(product.category ? { item_category: product.category } : {}),
    ...(variant?.capacity ? { item_variant: [variant.capacity, variant.color].filter(Boolean).join(' / ') } : {}),
    price: Number(variant?.price || 0),
    quantity
  } : null;

  if (action === 'view_item') {
    track('view_item', { currency: 'USD', value: Number(variant?.price || 0), items: item ? [item] : undefined, productId: product?.id, variantId: variant?.id });
    return;
  }
  if (action === 'out_of_stock') {
    track('out_of_stock', { productId: product?.id, variantId: variant?.id, items: item ? [item] : undefined });
    return;
  }
  if (action === 'add_to_cart') {
    track('add_to_cart', { currency: 'USD', value: Number(variant?.price || 0) * quantity, items: item ? [item] : undefined });
    return;
  }
  if (action === 'begin_checkout') {
    track('begin_checkout', { currency: 'USD', value, items: item ? [item] : undefined });
    return;
  }
  if (action === 'purchase' && order) {
    track('purchase', {
      currency: 'USD',
      value: Number(order.totals?.total || 0),
      transaction_id: order.number,
      items: (order.items || []).map((entry) => ({
        item_id: entry.variant?.sku || entry.sku || entry.id,
        item_name: entry.name,
        price: Number(entry.unitPrice || 0),
        quantity: Number(entry.quantity || 1)
      }))
    });
  }
}
