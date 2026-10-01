/**
 * Ficha de producto en el navegador.
 *
 * El HTML inicial ya lo envía el servidor con precio y disponibilidad reales.
 * Acá se añade la interacción: cambiar de variante recalcula precio, stock,
 * SKU e imagen, y se puede agregar al carrito o consultar por WhatsApp.
 */
import { state } from './store.js';
import { escape, galleryMarkup, priceBlock, discountPercent, variantGroups, specsMarkup, stockClass, stockLabel, productCard, whatsappButton } from './ui.js';

export function productView(product, selected) {
  const config = state.config || {};
  const images = galleryMarkup(product, selected);
  const groups = variantGroups(product, selected);
  const discount = discountPercent(selected);
  const whatsapp = whatsappButton({ product, variant: selected, config });
  const outOfStock = !selected || selected.availability === 'OUT';

  return `<div class="container">
  <div class="breadcrumbs"><a href="/" data-link>Inicio</a><span>/</span><a href="/catalogo" data-link>Catálogo</a><span>/</span><span>${escape(product.name)}</span></div>
  <div class="product-detail">
    <div class="detail-visual ${images.length ? '' : 'empty'}">${images.length ? images.join('') : '<span class="image-placeholder" aria-hidden="true"></span>'}</div>
    <div class="detail-info">
      <span class="eyebrow">${escape(product.brand || config.brandName || 'Tecnología')}${product.category ? ` · ${escape(product.category)}` : ''}</span>
      <h1>${escape(product.name)}</h1>
      <p class="lead">${escape(product.description || 'Equipo seleccionado con atención personalizada. Consultá disponibilidad y variantes actualizadas.')}</p>
      ${priceBlock(selected, discount)}
      <div class="variant-block">
        ${groups.map((group) => `<div class="variant-group">
          <div class="variant-label"><span>${escape(group.label)}</span><span>${escape(group.selected || '')}</span></div>
          <div class="variant-options" role="group" aria-label="${escape(group.label)}">
            ${group.options.map((option) => `<button type="button" class="variant-option ${option.selected ? 'selected' : ''} ${option.unavailable ? 'unavailable' : ''}" data-action="select-variant" data-product-id="${escape(product.id)}" data-variant-id="${escape(option.variantId)}" aria-pressed="${option.selected ? 'true' : 'false'}" ${option.unavailable ? 'disabled' : ''}>${escape(option.label)}</button>`).join('')}
          </div>
        </div>`).join('')}
        <p class="detail-stock ${stockClass(selected?.availability)}">${stockLabel(selected)}</p>
        <p class="sku-line">SKU: ${escape(selected?.sku || 'a definir')}</p>
      </div>
      <div class="detail-actions">
        <button class="btn btn-primary" data-action="add-product" data-product-id="${escape(product.id)}" data-variant-id="${escape(selected?.id || '')}" ${outOfStock ? 'disabled' : ''}>${outOfStock ? 'Sin stock' : 'Agregar al carrito'}</button>
        ${whatsapp}
      </div>
      ${outOfStock && selected ? `<form class="back-stock" data-form="back-stock" data-variant-id="${escape(selected.id)}">
        <label class="filter-label" for="back-stock-email">Avisame cuando vuelva</label>
        <div class="back-stock-row"><input class="input" id="back-stock-email" name="email" type="email" required placeholder="tu@email.com"><button class="btn btn-soft" type="submit">Notificarme</button></div>
      </form>` : ''}
      ${specsMarkup(product, selected)}
    </div>
  </div>
  ${relatedSection(product)}
</div>`;
}

function relatedSection(product) {
  const related = (state.catalog.products || [])
    .filter((item) => item.id !== product.id && (item.brandId === product.brandId || item.categoryId === product.categoryId))
    .slice(0, 4);
  if (!related.length) return '';
  return `<section class="section"><div class="section-head">
    <div><h2>También te puede interesar</h2></div>
    <a class="btn btn-ghost" href="/catalogo" data-link>Ver catálogo →</a>
  </div><div class="product-grid">${related.map(productCard).join('')}</div></section>`;
}
