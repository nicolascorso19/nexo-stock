/**
 * Vistas del navegador: inicio, catálogo, carrito, cuenta, pedido y admin.
 *
 * Cada función devuelve markup. No llaman a la API ni tocan el estado: eso
 * queda en app.js, para que el HTML sea legible y comprobable por separado.
 */
import { state } from './store.js';
import { escape, money, number, productCard, imageMarkup, stockClass, stockLabel, statusClass, whatsappButton, whatsappFab, hasWhatsapp } from './ui.js';

/* ------------------------------------------------------------------- inicio */

function section(title, subtitle, products, href, label = 'Ver todo →') {
  if (!products.length) return '';
  return `<section class="section">
    <div class="section-head">
      <div><h2>${escape(title)}</h2>${subtitle ? `<p>${escape(subtitle)}</p>` : ''}</div>
      ${href ? `<a class="btn btn-ghost" href="${escape(href)}" data-link>${escape(label)}</a>` : ''}
    </div>
    <div class="product-grid">${products.map(productCard).join('')}</div>
  </section>`;
}

export function homeView({ hero = {}, products = [], categories = [], unavailable = false }) {
  const inStock = products.filter((product) => product.variants?.some((variant) => variant.availability !== 'OUT'));
  const discounted = products.filter((product) => product.variants?.some((variant) => Number(variant.previousPrice) > Number(variant.price)));
  const newest = [...products].sort((a, b) => String(b.publishedAt || '').localeCompare(String(a.publishedAt || '')));
  // La imagen del hero sale del bloque configurable. Antes había un teléfono
  // dibujado con gradientes CSS, que es un adorno y no el producto real.
  const heroImage = safeUrl(hero.image_url || hero.imageUrl || hero.image || '');

  return `
  <section class="hero"><div class="container"><div class="hero-grid">
    <div class="hero-copy">
      <span class="eyebrow">${escape(hero.eyebrow || 'Tecnología con intención')}</span>
      <h1>${escape(hero.title || 'Encontrá tu próximo smartphone.')}</h1>
      <p>${escape(hero.subtitle || 'Equipos seleccionados. Compra segura. Atención personalizada.')}</p>
      <div class="hero-actions">
        <a class="btn btn-primary" href="/catalogo" data-link>Ver smartphones</a>
        <a class="btn btn-ghost" href="/catalogo?availability=in" data-link>Ver disponibles</a>
      </div>
    </div>
    ${heroImage ? `<div class="hero-visual"><img src="${safeUrl(heroImage)}" alt="${escape(hero.alt || hero.title || '')}" width="720" height="480" fetchpriority="high" decoding="async"></div>` : ''}
  </div></div></section>

  ${unavailable ? '<div class="container"><div class="notice warning">Estamos actualizando la disponibilidad. Intentá nuevamente en unos minutos.</div></div>' : ''}

  ${categories.length ? `<section class="section-tight"><div class="container"><div class="category-strip">${categories.map((category) => `
    <a class="category-card" href="/catalogo?category=${encodeURIComponent(category.name)}" data-link>
      <strong>${escape(category.name)}</strong><span>${number(category.count)} producto${category.count === 1 ? '' : 's'}</span>
    </a>`).join('')}</div></div></section>` : ''}

  ${section('iPhone', 'Los modelos más pedidos, con stock verificado.', products.filter((product) => /iphone/i.test(product.name)).slice(0, 8), '/catalogo?category=Celulares')}
  ${section('Más vendidos', 'Los equipos que la gente más está mirando.', inStock.filter((product) => product.isTrending).slice(0, 8), '/catalogo?sort=best-sellers')}
  ${section('Ofertas', 'Descuentos activos por tiempo limitado.', discounted.slice(0, 8), '/catalogo?sort=offers')}
  ${section('Nuevos ingresos', 'Lo último que entró al catálogo.', newest.slice(0, 8), '/catalogo?sort=newest')}
  ${section('Accesorios', 'Fundas, vidrios, cargadores y más.', products.filter((product) => /accesorio|vidrio|cargador|cable|funda/i.test(`${product.category} ${product.name}`)).slice(0, 8), '/catalogo?category=Accesorios')}

  <section class="section-tight"><div class="container"><div class="trust-grid">
    <div class="trust-card"><strong>Compra segura</strong><span>Pago procesado por el proveedor habilitado. No guardamos datos de tarjetas.</span></div>
    <div class="trust-card"><strong>Stock real</strong><span>La disponibilidad viene del sistema de inventario, sin aproximaciones.</span></div>
    <div class="trust-card"><strong>Productos verificados</strong><span>Equipos revisados y con garantía antes de salir del local.</span></div>
    <div class="trust-card"><strong>Retiro en Córdoba Capital</strong><span>Consultá también envíos y atención personalizada.</span></div>
  </div></div></section>

  ${hasWhatsapp(state.config) ? whatsappFab(state.config) : ''}`;
}

/* ----------------------------------------------------------------- catálogo */

/** El stock etiqueta la condición en español ("Nuevo"); la URL va en minúsculas. */
const CONDITION_LABELS = { nuevo: 'Nuevo', used: 'Usado', usado: 'Usado', reacondicionado: 'Reacondicionado' };

export function catalogView({ params, products, total, unavailable, facets }) {
  const query = params.get('q');
  const heading = query ? `Resultados para “${escape(query)}”` : params.get('category') || params.get('brand') || 'Catálogo';
  const sorts = [['relevance', 'Recomendados'], ['best-sellers', 'Más vendidos'], ['price-asc', 'Precio menor'], ['price-desc', 'Precio mayor'], ['offers', 'Ofertas'], ['newest', 'Más nuevos']];

  return `
  <section class="page-hero"><div class="container">
    <div class="breadcrumbs"><a href="/" data-link>Inicio</a><span>/</span><span>Catálogo</span></div>
    <span class="eyebrow">Inventario conectado</span>
    <h1>${heading}</h1>
    <p>${unavailable ? 'Estamos verificando la conexión con el sistema de stock.' : 'Cada disponibilidad y precio se valida nuevamente al agregar y al confirmar.'}</p>
  </div></section>
  <section><div class="container"><div class="catalog-layout">
    ${filtersAside(params, facets)}
    <div>
      <div class="catalog-toolbar">
        <p>${unavailable ? 'Catálogo temporalmente no disponible' : `${number(total)} producto${total === 1 ? '' : 's'}`}</p>
        <label class="sort-label">Ordenar
          <select class="select" data-filter-sort>
            ${sorts.map(([value, label]) => `<option value="${value}" ${params.get('sort') === value ? 'selected' : ''}>${label}</option>`).join('')}
          </select>
        </label>
      </div>
      ${unavailable
        ? '<div class="notice warning">Estamos actualizando la disponibilidad. Intentá nuevamente en unos minutos.</div>'
        : products.length
          ? `<div class="product-grid">${products.map(productCard).join('')}</div>${pager(params, total)}`
          : emptyCatalog()}
    </div>
  </div></div></section>`;
}

/**
 * Paginación. Sin esto, los productos que caían fuera de la primera tanda de 24
 * no tenían forma de alcanzarse: el servidor los recortaba sin enlace visible.
 */
function pager(params, total) {
  const pageSize = 24;
  const totalPages = Math.max(1, Math.ceil(Number(total || 0) / pageSize));
  const page = Math.min(totalPages, Math.max(1, Number(params.get('page')) || 1));
  if (totalPages < 2) return '';
  const link = (target) => {
    const next = new URLSearchParams(params);
    if (String(target) !== '1') next.set('page', String(target)); else next.delete('page');
    const query = next.toString();
    return `/catalogo${query ? `?${query}` : ''}`;
  };
  const numbers = [];
  for (let index = 1; index <= totalPages; index += 1) {
    if (totalPages > 7 && index !== 1 && index !== totalPages && Math.abs(index - page) > 1) {
      if (numbers[numbers.length - 1] !== '…') numbers.push('…');
      continue;
    }
    numbers.push(String(index));
  }
  // El número de página viaja como dato, nunca se convierte un texto: los
  // identificadores de la tienda no se parsean a número en el cliente.
  const current = String(page);
  return `<nav class="pager" aria-label="Paginación">
    ${page > 1 ? `<a class="pager-step" href="${link(page - 1)}" rel="prev">Anterior</a>` : ''}
    ${numbers.map((item) => item === '…' ? '<span class="pager-gap">…</span>' : `<a class="pager-page${item === current ? ' active' : ''}" href="${link(item)}"${item === current ? ' aria-current="page"' : ''}>${item}</a>`).join('')}
    ${page < totalPages ? `<a class="pager-step" href="${link(page + 1)}" rel="next">Siguiente</a>` : ''}
  </nav>`;
}

function filtersAside(params, facets) {
  const link = (changes) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value); else next.delete(key);
    }
    const query = next.toString();
    return `/catalogo${query ? `?${query}` : ''}`;
  };
  // `labels` permite mostrar "Nuevo" y enlazar "nuevo": el servidor compara en
  // minúsculas y así la URL queda estable sin depender del idioma del dato.
  const group = (label, key, values, labels = {}) => {
    if (!values.length) return '';
    return `<div class="filter-group">
      <span class="filter-label">${escape(label)}</span>
      <div class="filter-options">
        <a href="${link({ [key]: '' })}" class="${!params.get(key) ? 'active' : ''}">Todos</a>
        ${values.map((value) => {
          const slugValue = String(value).toLowerCase();
          return `<a href="${link({ [key]: slugValue })}" class="${String(params.get(key) || '').toLowerCase() === slugValue ? 'active' : ''}">${escape(labels[slugValue] || value)}</a>`;
        }).join('')}
      </div>
    </div>`;
  };

  return `<aside class="filters">
    <div class="filter-group">
      <span class="filter-label">Disponibilidad</span>
      <div class="filter-options">
        <a href="${link({ availability: '' })}" class="${!params.get('availability') ? 'active' : ''}">Todos</a>
        <a href="${link({ availability: 'in' })}" class="${params.get('availability') === 'in' ? 'active' : ''}">Con stock</a>
        <a href="${link({ availability: 'out' })}" class="${params.get('availability') === 'out' ? 'active' : ''}">Sin stock</a>
        <a href="${link({ discount: 'true' })}" class="${params.get('discount') === 'true' ? 'active' : ''}">Con descuento</a>
      </div>
    </div>
    ${group('Categoría', 'category', facets.categories)}
    ${group('Marca', 'brand', facets.brands)}
    ${group('Modelo', 'model', facets.models)}
    ${group('Condición', 'condition', facets.conditions, CONDITION_LABELS)}
    ${group('Capacidad', 'capacity', facets.capacities)}
    ${group('Color', 'color', facets.colors)}
    <div class="filter-group">
      <span class="filter-label">Precio máximo (USD)</span>
      <form class="price-filter" data-form="price-filter">
        <label class="sr-only" for="max-price">Precio máximo</label>
        <input class="input" id="max-price" type="number" name="maxPrice" min="0" step="50" value="${escape(params.get('maxPrice') || '')}" placeholder="Sin límite">
        <input type="hidden" name="keep" value="${escape(params.toString())}">
        <button class="btn btn-soft btn-small" type="submit">Aplicar</button>
      </form>
    </div>
    <div class="filter-group">
      <span class="filter-label">Ordenar por precio</span>
      <div class="filter-options">
        <a href="${link({ sort: 'price-asc' })}" class="${params.get('sort') === 'price-asc' ? 'active' : ''}">Menor a mayor</a>
        <a href="${link({ sort: 'price-desc' })}" class="${params.get('sort') === 'price-desc' ? 'active' : ''}">Mayor a menor</a>
      </div>
    </div>
    <div class="filter-group">
      <a class="btn btn-ghost btn-block btn-small" href="/catalogo" data-link>Limpiar filtros</a>
    </div>
  </aside>`;
}

function emptyCatalog() {
  return `<div class="empty-state">
    <h3>No hay productos que coincidan</h3>
    <p>Probá con otro término o quitá algunos filtros. No mostramos stock ni productos de ejemplo.</p>
    <a class="btn btn-primary" href="/catalogo" data-link>Ver todo el catálogo</a>
  </div>`;
}

/* ------------------------------------------------------------------ carrito */

export function cartView({ cart }) {
  const lines = cart.quote?.lines || [];
  if (!cart.items?.length) {
    return `<div class="container"><div class="empty-state mt-20">
      <h3>Tu carrito está vacío</h3>
      <p>Cuando encuentres un equipo agregalo acá. Verificamos stock y precio antes de confirmar.</p>
      <a class="btn btn-primary" href="/catalogo" data-link>Explorar catálogo</a>
    </div></div>`;
  }
  return `<div class="container">
    <div class="page-hero"><span class="eyebrow">Tu selección</span><h1>Carrito</h1><p>Los precios y la disponibilidad se vuelven a validar en cada paso.</p></div>
    <div class="cart-layout">
      <section class="panel">
        ${lines.length ? lines.map((line, index) => cartLine(line, cart.items[index])).join('') : '<div class="notice warning">Estamos verificando la disponibilidad del carrito.</div>'}
        <div class="flex-between mt-20">
          <a class="btn btn-ghost" href="/catalogo" data-link>← Seguir comprando</a>
          <div class="flex">
            <span class="muted cart-verify">${cart.availability?.state === 'OK' ? 'Stock verificado' : 'Stock pendiente de verificación'}</span>
            <button class="btn btn-small btn-danger" data-action="clear-cart">Vaciar carrito</button>
          </div>
        </div>
      </section>
      ${summaryPanel(cart.quote, false)}
    </div>
  </div>`;
}

function cartLine(line, item) {
  const image = line.variant?.images?.[0] || line.product?.images?.[0];
  return `<div class="cart-line">
    <div class="cart-thumb">${imageMarkup(image, line.product?.name || '')}</div>
    <div class="cart-line-body">
      <h3><a href="/producto/${encodeURIComponent(line.product?.slug || line.product?.id || '')}" data-link>${escape(line.product?.name || 'Producto')}</a></h3>
      <p class="muted">${escape([line.variant?.capacity, line.variant?.color].filter(Boolean).join(' · ') || 'Estándar')}</p>
      <strong>${money(line.unitPrice / 100)}</strong>
      <span class="stock-label ${stockClass(line.variant?.availability)}">${stockLabel(line.variant)}</span>
    </div>
    <div class="cart-line-actions">
      <div class="quantity-control">
        <button data-action="cart-qty" data-item-id="${escape(item.id)}" data-delta="-1" aria-label="Restar una unidad">−</button>
        <span>${number(line.quantity)}</span>
        <button data-action="cart-qty" data-item-id="${escape(item.id)}" data-delta="1" aria-label="Sumar una unidad">+</button>
      </div>
      <button class="btn btn-small btn-danger mt-20" data-action="remove-cart" data-item-id="${escape(item.id)}">Quitar</button>
    </div>
  </div>`;
}

export function summaryPanel(quote, checkout = false) {
  if (!quote) {
    return `<aside class="panel summary"><h3>Resumen</h3>
      <p class="muted">La cotización aparece al verificar el stock.</p>
      <a class="btn btn-primary btn-block" href="/checkout" data-link>Ir al checkout</a></aside>`;
  }
  return `<aside class="panel summary">
    <h3>Resumen</h3>
    <div class="summary-row"><span>Subtotal</span><strong>${money(quote.subtotalCents / 100)}</strong></div>
    ${quote.discountCents ? `<div class="summary-row"><span>Descuentos</span><strong>−${money(quote.discountCents / 100)}</strong></div>` : ''}
    <div class="summary-row"><span>Envío</span><strong>${quote.shippingCents ? money(quote.shippingCents / 100) : 'A calcular'}</strong></div>
    <div class="summary-row summary-total"><span>Total estimado</span><strong>${money(quote.totalCents / 100)}</strong></div>
    ${checkout ? '<form class="coupon-form" data-form="coupon"><label class="sr-only" for="coupon-code">Cupón</label><input class="input" id="coupon-code" name="code" placeholder="Cupón"><button class="btn btn-soft" type="submit">Aplicar</button></form>' : ''}
    ${checkout ? '' : '<a class="btn btn-primary btn-block mt-20" href="/checkout" data-link>Continuar al checkout →</a>'}
    <p class="summary-note">No almacenamos datos de tarjetas. El pago se procesa con el proveedor habilitado.</p>
  </aside>`;
}

/* ----------------------------------------------------------------- checkout */

export function checkoutView({ cart, config = {}, draft = {} }) {
  if (!cart?.items?.length) return cartView({ cart });
  const quote = draft.quote;
  const shipping = config.shipping || {};
  const payments = config.payments || {};
  const banking = config.bank;

  return `<div class="container">
    <div class="page-hero">
      <span class="eyebrow">Checkout seguro</span>
      <h1>Terminar compra</h1>
      <p>No se cobran datos de tarjetas. El pago se procesa mediante el proveedor habilitado.</p>
    </div>
    <div class="checkout-layout">
      <section class="panel">
        <div class="checkout-steps"><span class="checkout-step active">1 · Datos</span><span class="checkout-step active">2 · Entrega</span><span class="checkout-step active">3 · Pago</span></div>
        <form data-form="checkout">
          <h2 class="form-title">Datos del cliente</h2>
          <div class="form-grid">
            <div class="form-field"><label for="firstName">Nombre</label><input class="input" id="firstName" name="firstName" required autocomplete="given-name" value="${escape(draft.firstName || '')}"></div>
            <div class="form-field"><label for="lastName">Apellido</label><input class="input" id="lastName" name="lastName" required autocomplete="family-name" value="${escape(draft.lastName || '')}"></div>
            <div class="form-field"><label for="documentNumber">DNI</label><input class="input" id="documentNumber" name="documentNumber" required value="${escape(draft.documentNumber || '')}"></div>
            <div class="form-field"><label for="email">Email</label><input class="input" id="email" name="email" type="email" required autocomplete="email" value="${escape(draft.email || '')}"></div>
            <div class="form-field"><label for="phone">Teléfono</label><input class="input" id="phone" name="phone" required autocomplete="tel" value="${escape(draft.phone || '')}"></div>
            <div class="form-field"><label for="whatsapp">WhatsApp (opcional)</label><input class="input" id="whatsapp" name="whatsapp" value="${escape(draft.whatsapp || '')}"></div>
          </div>

          <h2 class="form-title">Entrega</h2>
          <div class="payment-options">
            <label class="payment-option"><input type="radio" name="fulfillmentMethod" value="PICKUP" ${draft.fulfillmentMethod !== 'SHIPPING' ? 'checked' : ''} ${shipping.pickupEnabled ? '' : 'disabled'}><span>Retiro en ${escape(config.address?.locality || 'Córdoba Capital')}<small>${shipping.pickupEnabled ? 'Sin costo. Coordinás el retiro por WhatsApp.' : 'No disponible por el momento.'}</small></span></label>
            <label class="payment-option"><input type="radio" name="fulfillmentMethod" value="SHIPPING" ${draft.fulfillmentMethod === 'SHIPPING' ? 'checked' : ''} ${shipping.shippingEnabled ? '' : 'disabled'}><span>Envío a domicilio<small>${shipping.shippingEnabled ? `Costo ${money(shipping.flatCents / 100)}${shipping.freeFromCents ? ` · gratis desde ${money(shipping.freeFromCents / 100)}` : ''}.` : 'No disponible por el momento.'}</small></span></label>
          </div>
          ${draft.fulfillmentMethod === 'SHIPPING' ? addressFields(draft) : ''}

          <h2 class="form-title">Medio de pago</h2>
          <div class="payment-options">
            ${paymentOption('bank_transfer', 'Transferencia bancaria', banking?.alias ? `Alias: ${banking.alias}` : 'Se coordina por WhatsApp', draft.paymentMethod, payments.transfer)}
            ${paymentOption('cash', 'Efectivo al retirar', 'Pagás al momento de retirar el equipo', draft.paymentMethod, payments.cash)}
            ${paymentOption('card', 'Mercado Pago', payments.card ? 'Tarjeta de crédito o débito' : 'Requiere credenciales configuradas', draft.paymentMethod, payments.card)}
          </div>
          ${banking && draft.paymentMethod === 'bank_transfer' ? `<div class="notice"><strong>Datos para transferir</strong><br>Banco: ${escape(banking.name || 'a confirmar')}<br>Alias: ${escape(banking.alias || 'a confirmar')}<br>CBU: ${escape(banking.cbu || 'a confirmar')}<br>Titular: ${escape(banking.holder || 'a confirmar')}</div>` : ''}
          ${!payments.transfer && !payments.cash && !payments.card ? '<div class="notice warning">No hay medios de pago habilitados todavía. Contactanos por WhatsApp para coordinar.</div>' : ''}

          <label class="flex accept"><input type="checkbox" name="acceptPriceChanges" ${draft.acceptPriceChanges ? 'checked' : ''}> Confirmo el precio y la disponibilidad mostrados</label>
          <button class="btn btn-primary btn-block btn-large mt-20" type="submit" ${payments.transfer || payments.cash || payments.card ? '' : 'disabled'}>Confirmar pedido</button>
          <p class="form-note">Al confirmar, el sistema reserva el stock mientras se procesa el pago. Si el precio o la disponibilidad cambian, te avisamos antes de cobrar.</p>
        </form>
      </section>
      ${summaryPanel(quote, true)}
    </div>
  </div>`;
}

function addressFields(draft) {
  const address = draft.address || {};
  return `<div class="form-grid address-fields">
    <div class="form-field full"><label for="street">Dirección</label><input class="input" id="street" name="street" required autocomplete="street-address" value="${escape(address.street || '')}"></div>
    <div class="form-field"><label for="number">Número</label><input class="input" id="number" name="number" required value="${escape(address.number || '')}"></div>
    <div class="form-field"><label for="floor">Piso</label><input class="input" id="floor" name="floor" value="${escape(address.floor || '')}"></div>
    <div class="form-field"><label for="apartment">Depto</label><input class="input" id="apartment" name="apartment" value="${escape(address.apartment || '')}"></div>
    <div class="form-field"><label for="locality">Ciudad</label><input class="input" id="locality" name="locality" required value="${escape(address.locality || '')}"></div>
    <div class="form-field"><label for="province">Provincia</label><input class="input" id="province" name="province" required value="${escape(address.province || 'Córdoba')}"></div>
    <div class="form-field"><label for="postalCode">Código postal</label><input class="input" id="postalCode" name="postalCode" required inputmode="numeric" value="${escape(address.postalCode || '')}"></div>
  </div>`;
}

function paymentOption(value, title, subtitle, selected, enabled) {
  return `<label class="payment-option"><input type="radio" name="paymentMethod" value="${value}" ${selected === value ? 'checked' : ''} ${enabled ? '' : 'disabled'}><span>${escape(title)}<small>${escape(subtitle)}</small></span></label>`;
}

/* ------------------------------------------------------- cuenta y pedidos */

function authShell(title, subtitle, body) {
  return `<div class="auth-wrap"><div class="panel">
    <a class="logo" href="/" data-link><span class="brand-mark">N</span><span>${escape(state.config?.brandName || 'NEXO Tech')}</span></a>
    <h1 class="mt-20">${title}</h1><p>${subtitle}</p>${body}
  </div></div>`;
}

export function authView(route) {
  if (route === '/login') {
    return authShell('Ingresá a tu cuenta', 'Guardá tus pedidos y retomalos más rápido.', `<form data-form="login">
      <div class="form-field"><label for="login-email">Email</label><input class="input" id="login-email" name="email" type="email" required autocomplete="email"></div>
      <div class="form-field mt-20"><label for="login-password">Contraseña</label><input class="input" id="login-password" name="password" type="password" required autocomplete="current-password"></div>
      <button class="btn btn-primary btn-block mt-20" type="submit">Ingresar</button></form>
      <p class="auth-switch">¿No tenés cuenta? <a href="/registro" data-link>Crear cuenta</a> · <a href="/recuperar" data-link>Recuperar acceso</a></p>`);
  }
  if (route === '/registro') {
    return authShell('Creá tu cuenta', 'Tus datos sólo se usan para gestionar pedidos y entregas.', `<form data-form="register"><div class="form-grid">
      <div class="form-field"><label for="reg-first">Nombre</label><input class="input" id="reg-first" name="firstName" required autocomplete="given-name"></div>
      <div class="form-field"><label for="reg-last">Apellido</label><input class="input" id="reg-last" name="lastName" required autocomplete="family-name"></div>
      <div class="form-field"><label for="reg-document">DNI</label><input class="input" id="reg-document" name="documentNumber" required></div>
      <div class="form-field"><label for="reg-phone">Teléfono</label><input class="input" id="reg-phone" name="phone" required autocomplete="tel"></div>
      <div class="form-field full"><label for="reg-email">Email</label><input class="input" id="reg-email" name="email" type="email" required autocomplete="email"></div>
      <div class="form-field full"><label for="reg-password">Contraseña</label><input class="input" id="reg-password" name="password" type="password" minlength="8" required autocomplete="new-password"></div>
      </div><button class="btn btn-primary btn-block mt-20" type="submit">Crear cuenta</button></form>
      <p class="auth-switch">¿Ya tenés cuenta? <a href="/login" data-link>Ingresar</a></p>`);
  }
  return authShell('Recuperar acceso', 'Te enviaremos un enlace seguro si el email está registrado.', `<form data-form="recover">
    <div class="form-field"><label for="recover-email">Email</label><input class="input" id="recover-email" name="email" type="email" required autocomplete="email"></div>
    <button class="btn btn-primary btn-block mt-20" type="submit">Enviar enlace</button></form>
    <p class="auth-switch"><a href="/login" data-link>Volver a ingresar</a></p>`);
}

export function accountView({ user, authenticated }) {
  if (!authenticated) {
    return `<div class="auth-wrap"><div class="panel center"><h1>Tu cuenta</h1><p>Ingresá para consultar tus pedidos y datos.</p><a class="btn btn-primary" href="/login" data-link>Ingresar</a></div></div>`;
  }
  return `<div class="container">
    <div class="page-hero"><span class="eyebrow">Tu espacio</span><h1>Hola, ${escape(user.name || '')}</h1><p>Gestioná tus pedidos y preferencias.</p></div>
    <div class="account-layout">
      <nav class="account-nav"><a class="active" href="/cuenta" data-link>Resumen</a><a href="#pedidos">Mis pedidos</a><button data-action="logout">Cerrar sesión</button></nav>
      <section class="panel" id="pedidos">
        <div class="flex-between"><h2>Mis pedidos</h2><button class="btn btn-ghost btn-small" data-action="load-customer-orders">Actualizar</button></div>
        <div id="customer-orders"><div class="skeleton"></div></div>
      </section>
    </div>
  </div>`;
}

export async function loadCustomerOrders() {
  const container = document.querySelector('#customer-orders');
  if (!container) return;
  container.innerHTML = '<div class="skeleton"></div>';
  try {
    const { request, formatDate } = await import('./api.js');
    const orders = await request('/api/account/orders');
    container.innerHTML = orders.length
      ? orders.map((order) => `<div class="order-line">
          <span><strong>${escape(order.number)}</strong><br><small class="muted">${escape(formatDate(order.createdAt))} · ${order.items.length} producto${order.items.length === 1 ? '' : 's'}</small></span>
          <span>${money(order.totals.total)}<br><span class="status-pill ${statusClass(order.status)}">${escape(order.status)}</span></span>
        </div>`).join('')
      : '<p class="muted">Todavía no tenés pedidos.</p>';
  } catch (error) {
    container.innerHTML = `<div class="notice error">${escape(error.message)}</div>`;
  }
}

export function orderView() {
  return `<div class="container"><div class="order-confirmation panel" id="order-confirmation"><div class="skeleton"></div></div></div>`;
}

export function confirmationMarkup(order, token) {
  const config = state.config || {};
  return `<div class="center">
    <div class="confirmation-icon">${order.status === 'CANCELLED' ? '×' : '✓'}</div>
    <h1 class="mt-20">${order.status === 'CANCELLED' ? 'Pedido cancelado' : '¡Compra realizada!'}</h1>
    <p class="muted">${order.status === 'PENDING_PAYMENT' ? 'Recibimos tu pedido. Actualizaremos el estado cuando se confirme el pago.' : 'Tu pedido está siendo procesado.'}</p>
    <span class="order-number">${escape(order.number)}</span><br>
    <span class="order-status ${statusClass(order.status)}">${escape(order.status)}</span>
    <div class="order-lines">
      ${order.items.map((item) => `<div class="order-line"><span>${escape(item.name)} × ${number(item.quantity)}<br><small class="muted">${escape(item.variant || '')}</small></span><span>${money(item.lineTotal)}</span></div>`).join('')}
      <div class="order-line"><strong>Total</strong><strong>${money(order.totals.total)}</strong></div>
    </div>
    <div class="flex wrap center-actions">
      <a class="btn btn-primary" href="/catalogo" data-link>Seguir comprando</a>
      <a class="btn btn-ghost" href="/cuenta" data-link>Ver mis pedidos</a>
      ${whatsappButton({ config, label: 'Consultar por WhatsApp', className: 'btn btn-soft', order })}
      ${['PENDING_PAYMENT', 'PAYMENT_APPROVED'].includes(order.status) ? `<button class="btn btn-danger" data-action="cancel-order" data-order-number="${escape(order.number)}" data-order-token="${escape(token || '')}">Cancelar pedido</button>` : ''}
    </div>
    <p class="form-note">${order.status === 'PENDING_PAYMENT' ? 'Tu stock queda reservado mientras se confirma el pago. Si no se completa, la reserva se libera automáticamente.' : ''}</p>
  </div>`;
}

/* -------------------------------------------------------------------- admin */

export function adminView({ adminState, user }) {
  if (user?.kind !== 'admin') {
    return `<div class="auth-wrap"><div class="panel">
      <a class="logo" href="/" data-link><span class="brand-mark">N</span><span>Administración</span></a>
      <h1 class="mt-20">Panel del e-commerce</h1>
      <p>Acceso separado del sistema de stock. Desde acá se administran pedidos, contenido y pagos; el stock se modifica únicamente en NEXO Stock.</p>
      <form data-form="admin-login">
        <div class="form-field"><label for="admin-email">Email</label><input class="input" id="admin-email" name="email" type="email" required autocomplete="username"></div>
        <div class="form-field mt-20"><label for="admin-password">Contraseña</label><input class="input" id="admin-password" name="password" type="password" required autocomplete="current-password"></div>
        <button class="btn btn-primary btn-block mt-20">Ingresar</button>
      </form>
    </div></div>`;
  }
  const kpis = adminState.dashboard?.counts || {};
  return `<div class="container admin-shell">
    <div class="admin-head"><div><span class="eyebrow">Operación</span><h1>Pedidos</h1></div><button class="btn btn-ghost btn-small" data-action="load-admin">Actualizar</button></div>
    <div class="admin-kpis">
      <div class="kpi"><strong>${number(kpis.pending || 0)}</strong><span>En proceso</span></div>
      <div class="kpi"><strong>${number(kpis.review || 0)}</strong><span>Revisión</span></div>
      <div class="kpi"><strong>${number(kpis.paid || 0)}</strong><span>Pagados</span></div>
      <div class="kpi"><strong>${number(kpis.customers || 0)}</strong><span>Clientes</span></div>
    </div>
    <div class="admin-grid">
      <section class="panel">
        <div class="flex-between mb-20"><h2>Últimos pedidos</h2><span class="muted admin-note">No modifica stock</span></div>
        <div class="table-scroll"><table class="admin-table">
          <thead><tr><th>Pedido</th><th>Cliente</th><th>Total</th><th>Estado</th><th>Pago</th><th>Acción</th></tr></thead>
          <tbody>${(adminState.orders || []).slice(0, 20).map((order) => `<tr>
            <td><strong>${escape(order.number)}</strong></td>
            <td>${escape(order.customer?.firstName || '')} ${escape(order.customer?.lastName || '')}<br><small class="muted">${escape(order.customer?.email || '')}</small></td>
            <td>${money(order.totals?.total)}</td>
            <td><span class="status-pill ${statusClass(order.status)}">${escape(order.status)}</span></td>
            <td><span class="status-pill ${statusClass(order.paymentStatus)}">${escape(order.paymentStatus)}</span></td>
            <td>${orderPaymentForm(order)}</td>
          </tr>`).join('') || '<tr><td colspan="6" class="muted">No hay pedidos.</td></tr>'}</tbody>
        </table></div>
      </section>
      <section class="panel">
        <h2>Reglas de integración</h2>
        <div class="notice success"><strong>Stock privado</strong><br>Este panel no modifica stock, IMEI ni costos. Esas operaciones pasan por la API de NEXO Stock.</div>
        ${adminTools(adminState)}
      </section>
    </div>
  </div>`;
}

function orderPaymentForm(order) {
  // El pago pendiente más reciente es el que se confirma contra el sistema de stock.
  const pending = (order.payments || []).filter((payment) => payment.status === 'PENDING' || payment.status === 'PROCESSING').at(-1);
  if (!pending) return '<small class="muted">—</small>';
  return `<form data-form="admin-payment" class="inline-form">
    <input type="hidden" name="orderId" value="${escape(order.id)}">
    <input type="hidden" name="paymentId" value="${escape(pending.id)}">
    <button class="btn btn-small btn-soft" type="submit">Confirmar pago</button>
  </form>`;
}

function adminTools(adminState) {
  const settings = adminState.settings || {};
  const content = (adminState.content || []).find((item) => item.block_type === 'HERO') || {};
  return `<h3 class="mt-20">Configuración de tienda</h3>
  <form class="form-grid" data-form="admin-settings">
    <div class="form-field"><label for="set-brand">Nombre</label><input class="input" id="set-brand" name="brandName" value="${escape(settings.brand_name || '')}" required></div>
    <div class="form-field"><label for="set-city">Ciudad</label><input class="input" id="set-city" name="addressLocality" value="${escape(settings.address_locality || 'Córdoba Capital')}"></div>
    <div class="form-field"><label for="set-wa">WhatsApp</label><input class="input" id="set-wa" name="whatsapp" value="${escape(settings.whatsapp || '')}"></div>
    <div class="form-field"><label for="set-mail">Email</label><input class="input" id="set-mail" name="supportEmail" type="email" value="${escape(settings.support_email || '')}"></div>
    <label class="flex"><input type="checkbox" name="pickupEnabled" ${settings.pickup_enabled ? 'checked' : ''}> Retiro en local</label>
    <label class="flex"><input type="checkbox" name="shippingEnabled" ${settings.shipping_enabled ? 'checked' : ''}> Envíos</label>
    <label class="flex"><input type="checkbox" name="transferEnabled" ${settings.transfer_enabled ? 'checked' : ''}> Transferencia</label>
    <label class="flex"><input type="checkbox" name="cashEnabled" ${settings.cash_enabled ? 'checked' : ''}> Efectivo</label>
    <label class="flex"><input type="checkbox" name="cardEnabled" ${settings.card_enabled ? 'checked' : ''}> Mercado Pago (requiere credenciales)</label>
    <button class="btn btn-primary" type="submit">Guardar configuración</button>
  </form>
  <h3 class="mt-20">Contenido de la home</h3>
  <form class="form-grid" data-form="admin-content">
    <div class="form-field full"><label for="hero-title">Título principal</label><input class="input" id="hero-title" name="title" value="${escape(content.title || '')}"></div>
    <div class="form-field full"><label for="hero-subtitle">Subtítulo</label><input class="input" id="hero-subtitle" name="subtitle" value="${escape(content.subtitle || '')}"></div>
    <input type="hidden" name="blockKey" value="home-hero">
    <input type="hidden" name="blockType" value="HERO">
    <button class="btn btn-soft" type="submit">Guardar contenido</button>
  </form>
  <h3 class="mt-20">Analítica</h3>
  <form class="form-grid" data-form="admin-settings">
    <div class="form-field full"><label for="set-ga">Google Analytics 4 (ID)</label><input class="input" id="set-ga" name="gaMeasurementId" value="${escape(settings.ga_measurement_id || '')}" placeholder="G-XXXXXXXXXX"></div>
    <div class="form-field full"><label for="set-pixel">Meta Pixel (ID)</label><input class="input" id="set-pixel" name="metaPixelId" value="${escape(settings.meta_pixel_id || '')}" placeholder="1234567890"></div>
    <button class="btn btn-soft" type="submit">Guardar analítica</button>
  </form>`;
}

export async function loadAdmin(assign) {
  try {
    const { request } = await import('./api.js');
    const [dashboard, orders, settings, content] = await Promise.all([
      request('/api/admin/dashboard'),
      request('/api/admin/orders'),
      request('/api/admin/settings'),
      request('/api/admin/content')
    ]);
    assign({ dashboard, orders, settings, content });
  } catch (error) {
    // eslint-disable-next-line no-alert
    console.error(error.message);
  }
}

export function routeNotFound() {
  return `<div class="container"><div class="empty-state mt-20">
    <div class="empty-icon">404</div><h3>Página no encontrada</h3><p>La dirección no existe o cambió.</p>
    <a class="btn btn-primary" href="/" data-link>Volver al inicio</a>
  </div></div>`;
}
