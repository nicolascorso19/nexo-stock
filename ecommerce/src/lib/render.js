/**
 * Renderizado del HTML inicial de las páginas públicas.
 *
 * El navegador hidrata y reemplaza el contenido, pero el HTML que sale del
 * servidor ya es utilizable: contiene el texto real del producto, su precio y
 * su disponibilidad. Si la API de stock no responde se muestra un aviso
 * honesto en lugar de datos inventados.
 */
import { absoluteUrl, escapeHtml, money, truncate } from './seo.js';

const number = new Intl.NumberFormat('es-AR');

function availabilityLabel(availability, quantity) {
  if (availability === 'OUT') return 'Sin stock';
  if (availability === 'LOW') return `Últimas ${number.format(Number(quantity || 0))} unidades`;
  return `${number.format(Number(quantity || 0))} disponibles`;
}

function variantOptions(variants) {
  return variants.map((variant) => (
    `<li class="seo-variant"><span>${escapeHtml([variant.capacity, variant.color].filter(Boolean).join(' ') || 'Estándar')}</span>` +
    `<span class="seo-variant-price">${variant.priceKnown === false || !(Number(variant.price) > 0) ? 'Consultar' : `US$ ${money(variant.price)}`}</span>` +
    `<span class="seo-variant-stock${variant.availability === 'OUT' ? ' is-out' : ''}">${escapeHtml(availabilityLabel(variant.availability, variant.availableQuantity))}</span></li>`
  )).join('');
}

function productSummary(product) {
  const image = (product.images || [])[0] || (product.variants || []).flatMap((variant) => variant.images || [])[0];
  const prices = (product.variants || []).map((variant) => (variant.priceKnown === false ? null : Number(variant.price))).filter((value) => Number.isFinite(value) && value > 0);
  const from = prices.length ? Math.min(...prices) : null;
  const available = (product.variants || []).some((variant) => variant.availability !== 'OUT');
  return (
    `<article class="seo-card">` +
    `<a class="seo-card-media" href="/producto/${encodeURIComponent(product.slug || product.id)}">` +
    (image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(product.name)}" loading="lazy" decoding="async" width="320" height="320">` : '<span class="seo-card-placeholder" aria-hidden="true"></span>') +
    `</a>` +
    `<div class="seo-card-body">` +
    `<p class="seo-card-brand">${escapeHtml(product.brand || '')}</p>` +
    `<h2 class="seo-card-title"><a href="/producto/${encodeURIComponent(product.slug || product.id)}">${escapeHtml(product.name)}</a></h2>` +
    `<p class="seo-card-price">${from === null ? 'Consultar' : `Desde <strong>US$ ${money(from)}</strong>`}</p>` +
    `<p class="seo-card-stock${available ? '' : ' is-out'}">${available ? 'Disponible' : 'Sin stock'}</p>` +
    `</div></article>`
  );
}

function pageShell({ title, head, body, bodyClass = '' }) {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#ffffff">
<meta name="color-scheme" content="light">
${head}
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/css/styles.css">
<link rel="stylesheet" href="/css/seo.css">
</head>
<body class="${escapeHtml(bodyClass)}">
<a class="skip-link" href="#main-content">Saltar al contenido</a>
<div id="app">${body}</div>
<div id="toast-region" class="toast-region" aria-live="assertive" aria-atomic="true"></div>
<noscript>Necesitás activar JavaScript para comprar. La información del producto y el precio siguen visibles arriba.</noscript>
<script type="module" src="/js/app.js"></script>
</body>
</html>`;
}

function unavailableNotice() {
  return `<section class="seo-notice" role="status"><h1>Estamos actualizando la disponibilidad</h1>
<p>No pudimos consultar el sistema de stock en este momento. No mostramos precios ni disponibilidad hasta volver a sincronizar. Intentá nuevamente en unos minutos.</p></section>`;
}

function breadcrumbMarkup(items) {
  return `<nav class="breadcrumbs" aria-label="Ruta de navegación"><ol>${items.map((item, index) => (
    `<li>${item.href && index < items.length - 1 ? `<a href="${escapeHtml(item.href)}">${escapeHtml(item.name)}</a>` : `<span aria-current="page">${escapeHtml(item.name)}</span>`}</li>`
  )).join('')}</ol></nav>`;
}

/** Página de producto con contenido real: nombre, precio, stock, variantes y SKU. */
export function renderProductPage({ product, related = [], seoTags, baseUrl }) {
  const variants = product.variants || [];
  const prices = variants.map((variant) => (variant.priceKnown === false ? null : Number(variant.price))).filter((value) => Number.isFinite(value) && value > 0);
  const from = prices.length ? Math.min(...prices) : null;
  const gallery = [...new Set([...(product.images || []), ...variants.flatMap((variant) => variant.images || [])].filter(Boolean))];
  const highlights = Array.isArray(product.highlights) ? product.highlights : [];
  const specs = product.specifications && typeof product.specifications === 'object' ? product.specifications : {};
  const url = absoluteUrl(baseUrl, `/producto/${product.slug || product.id}`);

  const first = product.variants.find((variant) => variant.availability !== 'OUT') || product.variants[0];
  const body = `${breadcrumbMarkup([{ name: 'Inicio', href: '/' }, { name: 'Catálogo', href: '/catalogo' }, { name: product.name }])}
<main id="main-content" class="seo-product">
  <div class="seo-product-grid">
    <div class="seo-gallery">
      ${gallery.length
        ? gallery.map((src, index) => `<img src="${escapeHtml(src)}" alt="${escapeHtml(product.name)}${index ? ` ${index + 1}` : ''}" loading="${index ? 'lazy' : 'eager'}" decoding="async" width="600" height="600">`).join('')
        : '<div class="seo-gallery-placeholder" aria-hidden="true"></div>'}
    </div>
    <div class="seo-product-info">
      <p class="seo-product-brand">${escapeHtml(product.brand || '')}${product.category ? ` · ${escapeHtml(product.category)}` : ''}</p>
      <h1>${escapeHtml(product.name)}</h1>
      ${product.description ? `<p class="seo-product-description">${escapeHtml(truncate(product.description, 400))}</p>` : ''}
      <p class="seo-product-price">${from === null ? 'Consultar disponibilidad' : `Desde <strong>US$ ${money(from)}</strong>`}${
        first && Number(first.previousPrice) > Number(first.price)
          ? ` <span class="seo-product-price-old"><s>US$ ${money(first.previousPrice)}</s></span> <span class="seo-badge">-${Math.round((1 - Number(first.price) / Number(first.previousPrice)) * 100)}% OFF</span>`
          : ''}</p>
      <p class="seo-product-stock">${variants.some((variant) => variant.availability !== 'OUT') ? 'Disponible para entrega inmediata' : 'Sin stock por el momento'}</p>
      <h2 class="seo-subtitle">Variantes disponibles</h2>
      <ul class="seo-variants">${variantOptions(variants)}</ul>
      ${highlights.length ? `<h2 class="seo-subtitle">Características</h2><ul class="seo-highlights">${highlights.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : ''}
      ${Object.keys(specs).length ? `<h2 class="seo-subtitle">Especificaciones</h2><dl class="seo-specs">${Object.entries(specs).map(([name, value]) => `<div><dt>${escapeHtml(name)}</dt><dd>${escapeHtml(String(value))}</dd></div>`).join('')}</dl>` : ''}
      <p class="seo-sku">Referencia: ${escapeHtml(variants[0]?.sku || 'a definir')}</p>
      <p class="seo-help">Precio y disponibilidad se validan nuevamente al agregar al carrito y antes de confirmar el pago.</p>
    </div>
  </div>
  ${related.length ? `<section class="seo-related"><h2>También te puede interesar</h2><div class="seo-grid">${related.map(productSummary).join('')}</div></section>` : ''}
</main>`;

  return pageShell({ title: product.name, head: seoTags, body, bodyClass: 'seo-mode' });
}

/** Catálogo con los productos ya renderizados. */
export function renderCatalogPage({ products, total, heading, subheading, crumbs, seoTags, baseUrl, pagerMarkup = '' }) {
  const count = total ?? products.length;
  const body = `${crumbs ? breadcrumbMarkup(crumbs) : ''}
<main id="main-content" class="seo-catalog">
  <header class="seo-page-head">
    <h1>${escapeHtml(heading)}</h1>
    ${subheading ? `<p>${escapeHtml(subheading)}</p>` : ''}
    <p class="seo-count">${number.format(count)} producto${count === 1 ? '' : 's'}</p>
  </header>
  ${products.length ? `<div class="seo-grid">${products.map(productSummary).join('')}</div>` : '<p class="seo-empty">No hay productos publicados que coincidan con esta búsqueda.</p>'}
  ${pagerMarkup}
</main>`;
  return pageShell({ title: heading, head: seoTags, body, bodyClass: 'seo-mode' });
}

/** Enlaces de paginación del HTML de servidor: hacen alcanzables las páginas 2+ a los buscadores. */
export function catalogPagerMarkup({ currentPath, query, page, pageSize, total }) {
  const totalPages = Math.max(1, Math.ceil(Number(total || 0) / Number(pageSize || 24)));
  if (totalPages < 2) return '';
  const href = (target) => {
    const next = new URLSearchParams(query);
    if (target > 1) next.set('page', String(target)); else next.delete('page');
    const search = next.toString();
    return `${currentPath}${search ? `?${search}` : ''}`;
  };
  const items = [];
  for (let index = 1; index <= totalPages; index += 1) {
    if (totalPages > 7 && index !== 1 && index !== totalPages && Math.abs(index - page) > 1) {
      if (items[items.length - 1] !== 'gap') items.push('gap');
      continue;
    }
    items.push(index);
  }
  return `<nav class="seo-pager" aria-label="Paginación">${items.map((item) => {
    if (item === 'gap') return '<span>…</span>';
    return `<a href="${escapeHtml(href(item))}"${item === page ? ' aria-current="page"' : ''}${item < page ? ' rel="prev"' : ''}${item > page ? ' rel="next"' : ''}>${item}</a>`;
  }).join('')}</nav>`;
}

/** Home comercial: propuesta de valor, categorías y productos destacados. */
export function renderHomePage({ hero, sections, settings, seoTags, baseUrl, unavailable = false }) {
  // Sólo se acepta una URL absoluta: el bloque de contenido es editable desde
  // el panel y no debe poder inyectar un esquema raro en el HTML.
  const rawHeroImage = String(hero?.image_url || hero?.imageUrl || '').trim();
  const heroImage = /^https?:\/\//i.test(rawHeroImage) ? escapeHtml(rawHeroImage) : '';
  const body = `<main id="main-content" class="seo-home">
  ${unavailable ? `<section class="seo-notice" role="status"><h1>Estamos actualizando la disponibilidad</h1>
<p>No pudimos consultar el sistema de stock en este momento. No mostramos precios, stock ni productos hasta volver a sincronizar. Intentá nuevamente en unos minutos.</p></section>` : ''}
  <section class="seo-hero">
    <div class="seo-hero-copy">
      <p class="seo-eyebrow">${escapeHtml(hero?.eyebrow || 'Tecnología con intención')}</p>
      <h1>${escapeHtml(hero?.title || 'Encontrá tu próximo equipo en Córdoba')}</h1>
      <p>${escapeHtml(hero?.subtitle || 'Equipos seleccionados, stock real sincronizado y atención personalizada.')}</p>
      <p><a class="btn btn-primary" href="/catalogo">Ver smartphones</a> <a class="btn btn-ghost" href="/catalogo?availability=in">Ver disponibles</a></p>
    </div>
    ${heroImage ? `<img class="seo-hero-media" src="${heroImage}" alt="${escapeHtml(hero?.title || '')}" width="720" height="480" fetchpriority="high" decoding="async">` : ''}
  </section>
  <nav class="seo-categories" aria-label="Categorías">
    ${(settings?.categories || []).map((category) => `<a href="/catalogo?category=${encodeURIComponent(category.name)}"><strong>${escapeHtml(category.name)}</strong><span>${number.format(category.count)} productos</span></a>`).join('')}
  </nav>
  ${sections.map((section) => (
    `<section class="seo-section">
      <header class="seo-section-head"><div><h2>${escapeHtml(section.title)}</h2>${section.subtitle ? `<p>${escapeHtml(section.subtitle)}</p>` : ''}</div>${section.href ? `<a class="seo-section-link" href="${escapeHtml(section.href)}">Ver todo →</a>` : ''}</header>
      <div class="seo-grid">${section.products.map(productSummary).join('')}</div>
    </section>`
  )).join('')}
  <section class="seo-trust">
    <h2>Comprá con confianza</h2>
    <ul>
      <li><strong>Stock real</strong><span>La disponibilidad viene del sistema de inventario, sin aproximaciones.</span></li>
      <li><strong>Reserva durante el pago</strong><span>Tu unidad queda reservada mientras confirmás el pago.</span></li>
      <li><strong>Pago seguro</strong><span>Procesado por el proveedor habilitado. No guardamos datos de tarjetas.</span></li>
      <li><strong>Retiro en Córdoba Capital</strong><span>Consultá también envíos y atención personalizada.</span></li>
    </ul>
  </section>
</main>`;
  return pageShell({ title: settings?.brandName || 'NEXO', head: seoTags, body, bodyClass: 'seo-mode' });
}

export function renderNotFoundPage({ seoTags }) {
  const body = `<main id="main-content" class="seo-error"><h1>Página no encontrada</h1>
<p>La dirección no existe o cambió. Podés volver al inicio o revisar el catálogo.</p>
<p><a class="btn btn-primary" href="/">Volver al inicio</a> <a class="btn btn-ghost" href="/catalogo">Ver catálogo</a></p></main>`;
  return pageShell({ title: 'Página no encontrada', head: seoTags, body, bodyClass: 'seo-mode' });
}
