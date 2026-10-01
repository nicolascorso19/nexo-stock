/**
 * Piezas de interfaz compartidas por las vistas del navegador.
 *
 * Se separan de app.js para que el marcado sea legible y testeable, y para que
 * producto, carrito y checkout muestren la información de la misma forma.
 */
import { formatMoney } from './api.js';
import { productMessage, orderMessage, whatsappLink, whatsappNumber } from './whatsapp.js';

export const escape = (value) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
export const safeUrl = (value) => (/^https?:\/\//i.test(String(value || '')) ? escape(value) : '');
export const textValue = (value) => escape(value).replace(/\n/g, '<br>');
export const money = (value) => formatMoney(value);
export const number = (value) => new Intl.NumberFormat('es-AR').format(Number(value || 0));

export function imageMarkup(url, alt, className = '') {
  const safe = safeUrl(url);
  return safe ? `<img class="${className}" src="${safe}" alt="${escape(alt)}" loading="lazy" decoding="async">` : '';
}

/** Imágenes de la variante elegida y, si no tiene, las del producto. */
export function galleryMarkup(product, selected) {
  const sources = [...new Set([
    ...(selected?.images || []),
    ...(product.images || [])
  ].filter(Boolean))];
  return sources.map((src, index) =>
    `<img src="${safeUrl(src)}" alt="${escape(product.name)}${index ? ` ${index + 1}` : ''}" loading="${index ? 'lazy' : 'eager'}" decoding="async" width="600" height="600">`
  );
}

/** Porcentaje de descuento de una variante, o 0 si no tiene precio anterior. */
export function discountPercent(variant) {
  if (!variant || !(Number(variant.previousPrice) > Number(variant.price))) return 0;
  return Math.round((1 - Number(variant.price) / Number(variant.previousPrice)) * 100);
}

/** Precio con tachado, descuento y Availability legible. */
export function priceBlock(variant, discount = discountPercent(variant)) {
  if (!variant) return '<div class="detail-price"><span class="price">Consultar disponibilidad</span></div>';
  return `<div class="detail-price">
    <span class="price">${money(variant.price)}</span>
    ${Number(variant.previousPrice) > Number(variant.price) ? `<span class="price-old">${money(variant.previousPrice)}</span>` : ''}
    ${discount ? `<span class="product-badge inline">-${discount}% OFF</span>` : ''}
  </div>`;
}

/**
 * Agrupa las variantes en "Capacidad" y "Color", como espera el cliente.
 * Cada opción conserva su SKU, precio y stock propios: al elegir una, la
 * página actualiza precio, disponibilidad e imagen.
 */
export function variantGroups(product, selected) {
  const variants = product.variants || [];
  const definitions = [
    { key: 'capacity', label: 'Capacidad', other: 'color' },
    { key: 'color', label: 'Color', other: 'capacity' }
  ];
  return definitions.map(({ key, label, other }) => {
    const values = [...new Set(variants.map((variant) => variant[key]).filter(Boolean))];
    if (values.length < 1) return null;
    return {
      label,
      selected: selected?.[key] || '',
      options: values.map((value) => {
        // Al elegir un atributo se conserva el otro: primero se busca la
        // variante que combine el valor nuevo con el valor ya elegido del
        // atributo contrario. Antes sólo se comprobaba la variante seleccionada,
        // así que elegir un color saltaba a la primera variante de ese color y
        // perdía la capacidad elegida.
        const keep = selected?.[other] || '';
        const withValue = variants.filter((variant) => variant[key] === value);
        const exact = keep ? withValue.filter((variant) => variant[other] === keep) : [];
        const match = exact.find((variant) => variant.availability !== 'OUT')
          || exact[0]
          || withValue.find((variant) => variant.availability !== 'OUT')
          || withValue[0];
        return {
          label: value,
          variantId: match?.id || '',
          selected: selected ? String(selected[key]).toLowerCase() === String(value).toLowerCase() : false,
          unavailable: !match || match.availability === 'OUT'
        };
      })
    };
  }).filter(Boolean);
}

/** Botón de WhatsApp con el mensaje ya redactado; vacío si no hay número. */
export function whatsappButton({ product, variant, order, config, label = 'Consultar por WhatsApp', className = 'btn btn-soft' }) {
  const message = order ? orderMessage(order) : productMessage({ product, variant, config });
  const href = whatsappLink({ message, config });
  if (!href) return '';
  return `<a class="${className}" href="${escape(href)}" target="_blank" rel="noopener noreferrer">${escape(label)}</a>`;
}

export function whatsappFab(config) {
  const href = whatsappLink({ message: 'Hola, tengo una consulta sobre un producto de la web.', config });
  if (!href) return '';
  return `<a class="whatsapp-fab" href="${escape(href)}" target="_blank" rel="noopener noreferrer" aria-label="Consultar por WhatsApp"><span aria-hidden="true">✆</span></a>`;
}

export function hasWhatsapp(config) {
  return Boolean(whatsappNumber(config));
}

/** Descripción, características y especificaciones de la ficha. */
export function specsMarkup(product, selected) {
  const highlights = Array.isArray(product.highlights) ? product.highlights : [];
  const specs = product.specifications && typeof product.specifications === 'object' ? product.specifications : {};
  if (!highlights.length && !Object.keys(specs).length) return '';
  return `<div class="specs-block">
    ${highlights.length ? `<h2 class="specs-title">Características</h2><ul class="specs-list">${highlights.map((item) => `<li>${escape(item)}</li>`).join('')}</ul>` : ''}
    ${Object.keys(specs).length ? `<h2 class="specs-title">Especificaciones</h2><dl class="specs-table">${Object.entries(specs).map(([name, value]) => `<div><dt>${escape(name)}</dt><dd>${escape(String(value))}</dd></div>`).join('')}</dl>` : ''}
    ${selected ? `<p class="specs-note">Los datos de disponibilidad y precio se vuelven a validar al confirmar el pago.</p>` : ''}
  </div>`;
}

/** Tarjeta de producto: imagen, precio, descuento y disponibilidad real. */
export function productCard(product) {
  const variant = (product.variants || []).find((item) => item.availability !== 'OUT') || (product.variants || [])[0];
  if (!variant) return '';
  const discount = discountPercent(variant);
  const href = `/producto/${encodeURIComponent(product.slug || product.id)}`;
  return `<article class="product-card" data-product-id="${escape(product.id)}">
    <a class="product-image ${variant.images?.[0] || product.images?.[0] ? '' : 'empty'}" href="${href}" data-link>
      ${imageMarkup(variant.images?.[0] || product.images?.[0], product.name)}
      ${discount ? `<span class="product-badge">-${discount}%</span>` : variant.availability === 'OUT' ? '<span class="product-badge out">Sin stock</span>' : ''}
    </a>
    <div class="product-body">
      <div class="product-meta">
        <span>${escape(product.brand || 'Tecnología')}</span>
        ${variant.condition ? `<span>${escape(variant.condition)}</span>` : ''}
      </div>
      <a href="${href}" data-link><h3 class="product-title">${escape(product.name)}</h3></a>
      <p class="product-variant">${escape([variant.capacity, variant.color].filter(Boolean).join(' / ') || 'Consultar disponibilidad')}</p>
      <div class="product-price-row">
        <span class="price">${money(variant.price)}</span>
        ${Number(variant.previousPrice) > Number(variant.price) ? `<span class="price-old">${money(variant.previousPrice)}</span>` : ''}
      </div>
      <span class="stock-label ${stockClass(variant.availability)}">${stockLabel(variant)}</span>
    </div>
  </article>`;
}

export function stockClass(value) {
  return value === 'OUT' ? 'out' : value === 'LOW' ? 'low' : '';
}

export function stockLabel(variant) {
  if (!variant) return 'Sin variantes publicadas';
  if (variant.availability === 'OUT') return 'Sin stock';
  const quantity = number(variant.availableQuantity || 0);
  if (variant.availability === 'LOW') return `Últimas ${quantity} unidades`;
  return `${quantity} disponibles`;
}

export function statusClass(value) {
  return String(value || '').toLowerCase().replace(/_/g, '-');
}

export function initials(name) {
  return String(name || 'N').split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase();
}
