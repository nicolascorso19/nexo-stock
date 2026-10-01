/* Catálogo público: sólo consume el endpoint público y nunca datos privados.
 *
 * El endpoint devuelve una fila por variante. Acá se agrupan por producto: los
 * celulares van primero y sus fundas y vidrios quedan juntos por modelo con el
 * color adentro, no sueltos uno por tarjeta. Sin framework ni build: es el mismo
 * archivo que se copia a docs/ para GitHub Pages.
 */
(() => {
  'use strict';
  const root = document.getElementById('public-catalog');
  const meta = document.getElementById('public-meta');
  const counts = document.getElementById('public-foot-counts');
  const updated = document.getElementById('public-updated');
  const search = document.getElementById('public-search');
  const esc = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
  const plain = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const setText = (selector, value) => document.querySelectorAll(selector).forEach(node => { node.textContent = value; });
  const STATUS = {
    DISPONIBLE: { className: 'public-stock--open', short: 'Disponible' },
    'ÚLTIMAS UNIDADES': { className: 'public-stock--low', short: 'Últimas unidades' },
    AGOTADO: { className: 'public-stock--out', short: 'Agotado' }
  };
  // El local vende celulares primero: en cualquier búsqueda los iPhone abren la
  // lista y los accesorios para ese mismo modelo vienen después.
  const ORDEN_CATEGORIA = { Celulares: 0 };
  // Vocabulario real del catálogo: sirve para detectar que "iPhone 15 Celeste" y
  // "iPhone 15" son el mismo producto con distinto color.
  const coloresConocidos = new Set();
  let products = [];
  let families = [];
  let query = '';
  let businessName = 'NEXO Móviles';
  let whatsapp = '';
  let dialog;

  // "Silicone Case iPhone 15 color Lila" y "... color Rosa" son el mismo producto
  // con distinto color: se juntan bajo "Silicone Case iPhone 15". También junta
  // "iPhone 15 Celeste" con "iPhone 15".
  const familiaDe = product => {
    const nombre = String(product.model || '').trim();
    const sinColor = nombre.replace(/\s*color\s+.*$/i, '').trim() || nombre;
    const partes = sinColor.split(' ');
    const ultima = plain(partes[partes.length - 1] || '');
    if (partes.length > 1 && ultima && coloresConocidos.has(ultima)) {
      return partes.slice(0, -1).join(' ').trim();
    }
    return sinColor;
  };

  const etiqueta = product => [product.color, product.capacity].filter(Boolean).join(' · ');

  // Si la variante no trae color ni capacidad, el nombre lo tiene:
  // "iPhone 15 Celeste" contra la familia "iPhone 15" es el color "Celeste".
  const etiquetaDe = (product, familia) => {
    const base = etiqueta(product);
    if (base) return base;
    const modelo = String(product.model || '').trim();
    if (!plain(modelo).startsWith(plain(familia.nombre))) return 'Único';
    const resto = modelo.slice(familia.nombre.length).replace(/^\s*color\s+/i, '').trim();
    return resto || 'Único';
  };

  // El catálogo no muestra precios: cada consulta se abre en WhatsApp con el
  // producto ya escrito, para que el cliente solo tenga que apretar enviar.
  const waLink = nombre => {
    if (!whatsapp) return '';
    const mensaje = encodeURIComponent(`Hola! Vi ${nombre} en la página de ${businessName} y quiero consultar precio y stock.`);
    return `<a class="public-wa" href="https://wa.me/${esc(whatsapp)}?text=${mensaje}" target="_blank" rel="noopener">Consultar por WhatsApp</a>`;
  };

  const agrupar = lista => {
    const mapa = new Map();
    for (const product of lista) {
      const nombre = familiaDe(product);
      if (!mapa.has(nombre)) {
        mapa.set(nombre, { nombre, category: product.category, marca: product.brand, opciones: [], conStock: 0 });
      }
      const familia = mapa.get(nombre);
      familia.opciones.push(product);
      if (product.stockStatus !== 'AGOTADO') familia.conStock += 1;
    }
    return [...mapa.values()].map(familia => {
      const conPrecio = familia.opciones.map(o => o.capacity).filter(Boolean);
      const sinStock = familia.opciones.every(o => o.stockStatus === 'AGOTADO');
      // La foto de la tarjeta es la de la primera opción con stock; si no hay
      // ninguna, la primera de todas.
      const primera = familia.opciones.find(o => o.stockStatus !== 'AGOTADO') || familia.opciones[0];
      return {
        ...familia,
        capacidad: [...new Set(conPrecio)].join(' · '),
        portada: primera.images?.[0] || '',
        estado: sinStock ? 'AGOTADO' : 'DISPONIBLE',
        opciones: familia.opciones.map(o => ({ ...o, etiqueta: etiquetaDe(o, familia) }))
      };
    }).sort((a, b) => {
      const ca = ORDEN_CATEGORIA[a.category] ?? 1;
      const cb = ORDEN_CATEGORIA[b.category] ?? 1;
      return ca !== cb ? ca - cb : a.nombre.localeCompare(b.nombre, 'es');
    });
  };

  const coincide = (familia, term) => !term
    || plain(familia.nombre).includes(term)
    || plain(familia.marca).includes(term)
    || plain(familia.category).includes(term)
    || familia.opciones.some(o => plain(`${o.color} ${o.capacity} ${o.model}`).includes(term));

  const tarjeta = familia => {
    const status = STATUS[familia.estado] || STATUS.AGOTADO;
    const varios = familia.opciones.length > 1;
    const swatches = varios
      ? `<ul class="public-swatches" aria-label="Colores disponibles">${familia.opciones.map(o =>
        `<li title="${esc(o.etiqueta)}"><span class="sr-only">${esc(o.etiqueta)}</span></li>`).join('')}</ul>`
      : '';
    return `<article class="public-card${familia.estado === 'AGOTADO' ? ' public-card--out' : ''}">
      ${familia.portada ? `<div class="public-card-media"><img src="${esc(familia.portada)}" alt="${esc(familia.nombre)}" loading="lazy" /></div>` : ''}
      <div class="public-card-top">
        <span class="public-brand">${esc(familia.category || familia.marca)}</span>
        <span class="public-stock ${status.className}">${esc(status.short)}</span>
      </div>
      <h2>${esc(familia.nombre)}</h2>
      ${familia.capacidad ? `<p class="public-spec">${esc(familia.capacidad)}</p>` : ''}
      ${swatches}
      ${varios
        ? `<button class="public-pick" type="button" data-family="${esc(familia.nombre)}">Ver ${familia.opciones.length} colores</button>`
        : waLink(`${familia.nombre} ${familia.opciones[0].etiqueta}`)}
    </article>`;
  };

  const modal = () => {
    if (dialog) return dialog;
    dialog = document.createElement('dialog');
    dialog.className = 'public-dialog';
    dialog.innerHTML = '<div class="public-dialog-head"><h2></h2>'
      + '<button class="public-dialog-close" type="button" aria-label="Cerrar">Cerrar</button></div>'
      + '<div class="public-dialog-body"></div>';
    document.body.appendChild(dialog);
    dialog.querySelector('.public-dialog-close').addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
    return dialog;
  };

  const abrir = nombre => {
    const familia = families.find(f => f.nombre === nombre);
    if (!familia) return;
    const dlg = modal();
    dlg.querySelector('h2').textContent = familia.nombre;
    dlg.querySelector('.public-dialog-body').innerHTML = `<ul class="public-options">${familia.opciones.map(o => {
      const status = STATUS[o.stockStatus] || STATUS.AGOTADO;
      const imagen = o.images?.[0] || '';
      const nombre = `${familia.nombre} ${o.etiqueta}`;
      return `<li class="public-option">
        ${imagen ? `<img src="${esc(imagen)}" alt="" loading="lazy" />` : '<span class="public-option-sin-foto"></span>'}
        <div class="public-option-info">
          <span class="public-option-name">${esc(o.etiqueta)}</span>
          <span class="public-stock ${status.className}">${esc(status.short)}</span>
        </div>
        ${waLink(nombre)}
      </li>`;
    }).join('')}</ul>`;
    dlg.showModal();
  };

  const render = () => {
    const term = plain(query.trim());
    const visibles = families.filter(familia => coincide(familia, term));
    root.innerHTML = visibles.length
      ? visibles.map(tarjeta).join('')
      : `<p class="public-empty">${term ? `Sin resultados para “${esc(query.trim())}”.` : 'Todavía no hay productos publicados.'}</p>`;
    const conStock = families.filter(f => f.estado !== 'AGOTADO').length;
    meta.innerHTML = families.length
      ? `${visibles.length} de ${families.length} productos <span>· ${conStock} con stock</span>`
      : 'Sin productos publicados.';
  };

  fetch('catalogo.json', { headers: { Accept: 'application/json' } })
    .then(response => { if (!response.ok) throw new Error('No se pudo consultar el catálogo.'); return response.json(); })
    .then(payload => {
      const data = payload.data;
      businessName = data.business?.name || businessName;
      whatsapp = data.business?.whatsapp || '';
      setText('[data-public-name]', businessName);
      setText('[data-public-location]', data.business?.location || 'Córdoba Capital');
      document.title = `${businessName} · Catálogo`;

      products = data.products || [];
      for (const product of products) {
        for (const parte of plain(product.color).split(/[,/]/)) {
          const palabra = parte.trim();
          if (palabra) coloresConocidos.add(palabra);
        }
      }
      families = agrupar(products);

      const porEstado = key => products.filter(item => item.stockStatus === key).length;
      counts.innerHTML = [
        ['Productos', families.length],
        ['Variantes', products.length],
        ['Disponibles', porEstado('DISPONIBLE')],
        ['Últimas unidades', porEstado('ÚLTIMAS UNIDADES')],
        ['Agotados', porEstado('AGOTADO')]
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

  root.addEventListener('click', event => {
    const boton = event.target.closest('[data-family]');
    if (boton) abrir(boton.dataset.family);
  });

  search.addEventListener('input', event => { query = event.target.value; render(); });
})();
