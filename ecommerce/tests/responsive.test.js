import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const css = fs.readFileSync(path.join(publicDir, 'css/styles.css'), 'utf8');
const seoCss = fs.readFileSync(path.join(publicDir, 'css/seo.css'), 'utf8');

/** Bloque de una media query, para no contar reglas fuera del breakpoint. */
function breakpoint(body, name = 'max-width: 760px') {
  const start = body.indexOf(`@media (${name})`);
  if (start === -1) return '';
  let depth = 0;
  for (let index = start; index < body.length; index += 1) {
    if (body[index] === '{') depth += 1;
    else if (body[index] === '}') {
      depth -= 1;
      if (depth === 0) return body.slice(start, index + 1);
    }
  }
  return '';
}

test('la hoja de estilo declara el viewport móvil y oculta la navegación de escritorio', () => {
  const index = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8');
  assert.match(index, /name="viewport" content="width=device-width, initial-scale=1/, 'debe declarar el viewport');
  assert.match(index, /<html lang="es">/, 'debe declarar el idioma');

  const mobile = breakpoint(css);
  assert.match(mobile, /\.main-nav,\s*\.header-tools \.search-mini\s*\{\s*display:\s*none/, 'la navegación de escritorio se oculta en celular');
  assert.match(mobile, /\.menu-button\s*\{\s*display:\s*grid/, 'el botón de menú aparece en celular');
  assert.match(mobile, /\.mobile-nav\.open\s*\{\s*display:\s*grid/, 'el menú móvil se abre al tocar');
});

test('las rejillas pasan a una columna en celular', () => {
  const mobile = breakpoint(css);
  for (const layout of ['.hero-grid', '.product-detail', '.cart-layout', '.checkout-layout', '.account-layout', '.admin-grid']) {
    assert.match(mobile, new RegExp(layout.replace('.', '\\.')), `${layout} debe adaptarse en celular`);
  }
  assert.match(mobile, /grid-template-columns:\s*1fr/, 'las rejillas principales pasan a una columna');
});

test('los controles táctiles principales son amplios', () => {
  // Los botones usan min-height, no padding vertical: se comprueba el alto real.
  assert.match(css, /\.btn\s*\{[^}]*min-height:\s*4[4-9]px/, 'los botones base deben medir al menos 44px de alto');
  assert.match(css, /\.btn-large\s*\{[^}]*padding:\s*1[6-9]px/, 'el botón de confirmar debe ser más alto');
  assert.match(breakpoint(css), /\.detail-actions \.btn\s*\{\s*flex:\s*1 1 100%/, 'en celular los botones de la ficha ocupan el ancho');
});

test('el contenido sin JavaScript se adapta también a celular', () => {
  // El HTML del servidor usa su propio breakpoint, más amplio que el de la SPA.
  const mobile = breakpoint(seoCss, 'max-width: 860px');
  assert.match(mobile, /\.seo-product-grid\s*\{\s*grid-template-columns:\s*1fr/, 'la ficha server-side pasa a una columna');
  assert.match(mobile, /\.seo-specs > div\s*\{\s*grid-template-columns:\s*1fr/, 'especificaciones en una columna');
});

test('las etiquetas visibles sólo para lectores de pantalla están definidas', () => {
  assert.match(css, /\.sr-only\s*\{/, 'debe existir la clase .sr-only');
  const views = fs.readFileSync(path.join(publicDir, 'js/views.js'), 'utf8');
  assert.match(views, /class="sr-only"/, 'las etiquetas de formulario deben usar .sr-only');
  assert.match(views, /class="sort-label"/, 'el selector de orden debe tener etiqueta');
  assert.match(views, /class="filter-label"[^>]*>Ordenar por precio/, 'los filtros necesitan etiqueta');
});

test('el estado de disponibilidad se distingue visualmente', () => {
  for (const state of ['out', 'low']) {
    assert.ok(css.includes(`.stock-label.${state}`) || css.includes(`.${state} {`), `debe existir estilo para stock ${state}`);
  }
  assert.match(css, /\.btn-danger/, 'debe existir estilo de acción destructiva para quitar productos');
  assert.match(css, /\.status-pill/, 'los estados de pedido deben ser legibles');
});
