/**
 * SEO y datos estructurados.
 *
 * Genera el <head> y el JSON-LD de cada página en el servidor. La tienda es
 * una SPA que se hidrata en el navegador, pero el HTML inicial ya trae el
 * título, la descripción, Open Graph y el contenido principal: los buscadores
 * y los comparadores de precios no dependen de ejecutar JavaScript.
 *
 * Este módulo nunca recibe costos, proveedores ni IMEI: sólo proyecta el
 * catálogo público que ya exposures la API de stock.
 */

const CURRENCY = 'USD';
const AVAILABILITY = { IN: 'https://schema.org/InStock', LOW: 'https://schema.org/InStock', OUT: 'https://schema.org/OutOfStock' };

export function absoluteUrl(base, pathname) {
  return `${String(base || '').replace(/\/$/, '')}/${String(pathname || '').replace(/^\//, '')}`;
}

export function money(value) {
  return Number(value || 0).toFixed(2);
}

export function truncate(value, max = 158) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).replace(/[\s,.;:]+$/, '')}…`;
}

/** Datos estructurados de la organización y el sitio. */
export function organizationJsonLd({ brandName, description, locality, supportEmail, whatsapp, publicBaseUrl }) {
  const node = {
    '@context': 'https://schema.org',
    '@type': 'OnlineStore',
    '@id': `${publicBaseUrl}/#organization`,
    name: brandName,
    url: publicBaseUrl,
    description
  };
  if (locality) node.address = { '@type': 'PostalAddress', addressLocality: locality, addressCountry: 'AR' };
  if (supportEmail) node.contactPoint = { '@type': 'ContactPoint', contactType: 'customer support', email: supportEmail, availableLanguage: ['es'] };
  if (whatsapp) node.sameAs = [`https://wa.me/${String(whatsapp).replace(/\D/g, '')}`];
  return {
    '@context': 'https://schema.org',
    '@graph': [
      node,
      { '@type': 'WebSite', '@id': `${publicBaseUrl}/#website`, url: publicBaseUrl, name: brandName, inLanguage: 'es-AR', publisher: { '@id': `${publicBaseUrl}/#organization` } }
    ]
  };
}

export function breadcrumbJsonLd(items) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      ...(item.href ? { item: absoluteUrl(item.baseUrl, item.href) } : {})
    }))
  };
}

/**
 * Product + AggregateOffer. Google acepta un AggregateOffer con el precio más
 * bajo del producto, lo que refleja el precio real que ve el cliente.
 */
export function productJsonLd({ product, baseUrl, url, images = [] }) {
  const variants = (product.variants || []).filter((variant) => Number.isFinite(Number(variant.price)) && variant.priceKnown !== false);
  const prices = variants.map((variant) => Number(variant.price));
  const lowest = prices.length ? Math.min(...prices) : null;
  const inStock = variants.some((variant) => variant.availability !== 'OUT');
  const gallery = [...new Set([...(product.images || []), ...variants.flatMap((variant) => variant.images || []), ...images].filter(Boolean))];

  // Se fusionan características y especificaciones en un único additionalProperty,
  // porque el nodo sólo admite una vez esa propiedad.
  const additional = [
    ...(product.highlights || []).map((value) => ({ '@type': 'PropertyValue', name: String(value) })),
    ...(specifications(product) || [])
  ];
  const node = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    '@id': `${url}#product`,
    name: product.name,
    url,
    ...(product.description ? { description: truncate(product.description, 500) } : {}),
    ...(product.brand ? { brand: { '@type': 'Brand', name: product.brand } } : {}),
    ...(product.category ? { category: product.category } : {}),
    ...(gallery.length ? { image: gallery } : {}),
    ...(additional.length ? { additionalProperty: additional } : {})
  };

  if (lowest === null) {
    node.offers = { '@type': 'Offer', url, priceCurrency: CURRENCY, availability: 'https://schema.org/OutOfStock', price: '0.00', priceValidUntil: priceValidUntil() };
    return node;
  }

  const cheapest = variants[prices.indexOf(lowest)];
  node.offers = variants.length > 1 ? {
    '@type': 'AggregateOffer',
    priceCurrency: CURRENCY,
    lowPrice: money(lowest),
    highPrice: money(Math.max(...prices)),
    offerCount: variants.length,
    offers: variants.map((variant) => ({
      '@type': 'Offer',
      sku: variant.sku,
      name: [variant.capacity, variant.color].filter(Boolean).join(' ') || undefined,
      url,
      priceCurrency: CURRENCY,
      price: money(variant.price),
      availability: AVAILABILITY[variant.availability] || AVAILABILITY.OUT,
      itemCondition: 'https://schema.org/NewCondition',
      inventoryLevel: Number(variant.availableQuantity || 0),
      ...(Number(variant.previousPrice) > Number(variant.price) ? { priceSpecification: { '@type': 'UnitPriceSpecification', priceCurrency: CURRENCY, price: money(variant.previousPrice), valueAddedTaxIncluded: false } } : {})
    }))
  } : {
    '@type': 'Offer',
    url,
    priceCurrency: CURRENCY,
    price: money(lowest),
    availability: inStock ? AVAILABILITY.IN : AVAILABILITY.OUT,
    itemCondition: 'https://schema.org/NewCondition',
    inventoryLevel: Number(cheapest?.availableQuantity || 0),
    ...(Number(cheapest?.previousPrice) > lowest ? { priceSpecification: { '@type': 'UnitPriceSpecification', priceCurrency: CURRENCY, price: money(cheapest.previousPrice) } } : {})
  };
  return node;
}

function specifications(product) {
  const source = product.specifications;
  if (!source || typeof source !== 'object') return null;
  return Object.entries(source)
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .map(([name, value]) => ({ '@type': 'PropertyValue', name, value: String(value) }));
}

function priceValidUntil() {
  const until = new Date();
  until.setDate(until.getDate() + 30);
  return until.toISOString().slice(0, 10);
}

/**
 * Etiquetas del <head>. Sólo las que el documento declare explícitamente.
 * `robots` siempre se declara: las páginas públicas son indexables por
 * defecto y las que no lo son (404, 503, filtros) pasan `noindex` a mano.
 */
export function headTags({ title, description, canonical, image, type = 'website', robots = 'index,follow', locale = 'es_AR' }) {
  const tags = [`<title>${escapeHtml(title)}</title>`];
  tags.push(`<meta name="description" content="${escapeHtml(truncate(description, 158))}">`);
  if (canonical) tags.push(`<link rel="canonical" href="${escapeHtml(canonical)}">`);
  tags.push(`<meta name="robots" content="${escapeHtml(robots)}">`);
  tags.push(`<meta property="og:type" content="${escapeHtml(type)}">`);
  tags.push(`<meta property="og:title" content="${escapeHtml(truncate(title, 95))}">`);
  tags.push(`<meta property="og:description" content="${escapeHtml(truncate(description, 158))}">`);
  tags.push(`<meta property="og:url" content="${escapeHtml(canonical || '')}">`);
  tags.push(`<meta property="og:site_name" content="${escapeHtml(title.split('|').pop().trim())}">`);
  tags.push(`<meta property="og:locale" content="${escapeHtml(locale)}">`);
  if (image) tags.push(`<meta property="og:image" content="${escapeHtml(image)}">`);
  tags.push('<meta name="twitter:card" content="summary_large_image">');
  tags.push(`<meta name="twitter:title" content="${escapeHtml(truncate(title, 95))}">`);
  tags.push(`<meta name="twitter:description" content="${escapeHtml(truncate(description, 158))}">`);
  if (image) tags.push(`<meta name="twitter:image" content="${escapeHtml(image)}">`);
  return tags;
}

export function jsonLdScript(data, nonce) {
  // El "</script>" se neutraliza para que el JSON-LD no pueda cerrar la etiqueta.
  const payload = JSON.stringify(data).replace(/</g, '\\u003c');
  return `<script type="application/ld+json"${nonce ? ` nonce="${escapeHtml(nonce)}"` : ''}>${payload}</script>`;
}

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
}
