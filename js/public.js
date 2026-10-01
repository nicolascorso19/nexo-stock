/* Catálogo público: sólo consume el endpoint público y nunca datos privados. */
(() => {
  'use strict';
  const root = document.getElementById('public-catalog');
  const meta = document.getElementById('public-meta');
  const counts = document.getElementById('public-foot-counts');
  const updated = document.getElementById('public-updated');
  const search = document.getElementById('public-search');
  const money = value => `US$ ${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const esc = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
  const setText = (selector, value) => document.querySelectorAll(selector).forEach(node => { node.textContent = value; });
  const STATUS = {
    DISPONIBLE: { className: 'public-stock--open', short: 'Disponible' },
    'ÚLTIMAS UNIDADES': { className: 'public-stock--low', short: 'Últimas unidades' },
    AGOTADO: { className: 'public-stock--out', short: 'Agotado' }
  };
  let products = [];
  let query = '';
  let locationName = 'Córdoba Capital';
  let businessName = 'NEXO Móviles';

  const card = product => {
    const status = STATUS[product.stockStatus] || STATUS.AGOTADO;
    const tags = [product.capacity, product.color].filter(Boolean);
    const spec = [product.variant, product.condition].filter(Boolean).join(' · ');
    const image = Array.isArray(product.images) ? product.images[0] : '';
    return `<article class="public-card${product.stockStatus === 'AGOTADO' ? ' public-card--out' : ''}">
      ${image ? `<div class="public-card-media"><img src="${esc(image)}" alt="${esc(`${product.brand} ${product.model}`)}" loading="lazy" /></div>` : ''}
      <div class="public-card-top">
        <span class="public-brand">${esc(product.brand)}</span>
        <span class="public-stock ${status.className}">${esc(status.short)}</span>
      </div>
      <h2>${esc(product.model)}</h2>
      ${spec ? `<p class="public-spec">${esc(spec)}</p>` : ''}
      ${tags.length ? `<ul class="public-tags">${tags.map(tag => `<li>${esc(tag)}</li>`).join('')}</ul>` : ''}
      <p class="public-price">${product.priceKnown === false || product.price === null || product.price === undefined ? 'Consultar' : money(product.price)}</p>
      ${product.location ? `<p class="public-foot">${esc(product.location)}</p>` : ''}
    </article>`;
  };

  const render = () => {
    const term = query.trim().toLowerCase();
    const visible = term
      ? products.filter(item => [item.brand, item.model, item.variant, item.capacity, item.color, item.category, item.location]
        .some(field => String(field || '').toLowerCase().includes(term)))
      : products;
    root.innerHTML = visible.length
      ? visible.map(card).join('')
      : `<p class="public-empty">${term ? `Sin resultados para “${esc(term)}”.` : 'Todavía no hay variantes publicadas.'}</p>`;
    const open = products.filter(item => item.stockStatus === 'DISPONIBLE').length;
    meta.innerHTML = products.length
      ? `${visible.length} de ${products.length} ${products.length === 1 ? 'variante' : 'variantes'} <span>· ${open} ${open === 1 ? 'disponible' : 'disponibles'} ahora</span>`
      : 'Sin variantes publicadas.';
  };

  fetch('/api/public/catalog', { headers: { Accept: 'application/json' } })
    .then(response => { if (!response.ok) throw new Error('No se pudo consultar el catálogo.'); return response.json(); })
    .then(payload => {
      const data = payload.data;
      locationName = data.business?.location || locationName;
      businessName = data.business?.name || businessName;
      setText('[data-public-name]', businessName);
      setText('[data-public-location]', locationName);
      document.title = `${businessName} · Catálogo`;

      products = data.products || [];
      const tally = key => products.filter(item => item.stockStatus === key).length;
      counts.innerHTML = [
        ['Variantes publicadas', products.length],
        ['Disponibles', tally('DISPONIBLE')],
        ['Últimas unidades', tally('ÚLTIMAS UNIDADES')],
        ['Agotados', tally('AGOTADO')]
      ].map(([label, value]) => `<li>${label} <b>${value}</b></li>`).join('');

      const when = data.generatedAt ? new Date(data.generatedAt) : null;
      updated.textContent = `Última actualización: ${when && !Number.isNaN(when.getTime()) ? when.toLocaleString('es-AR') : 'sin datos'}.`;

      render();
    })
    .catch(error => {
      root.innerHTML = `<p class="public-empty">${esc(error.message)}</p>`;
      meta.textContent = 'Catálogo no disponible.';
      updated.textContent = 'Última actualización: sin datos.';
    });

  search.addEventListener('input', event => { query = event.target.value; render(); });
})();
