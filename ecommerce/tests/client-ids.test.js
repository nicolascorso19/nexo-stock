import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const source = (name) => fs.readFileSync(path.join(publicDir, 'js', name), 'utf8');

/**
 * Los ids que entrega el sistema de stock son texto (por ejemplo
 * `variant_abc123`, `product_abc123`). Si el navegador los convierte a número,
 * llegan como NaN y el carrito responde "el producto ya no está disponible".
 *
 * Estos tests fijan ese contrato: `Number()` sólo puede aplicarse a cantidades
 * y precios, nunca a identificadores.
 */
const CANTIDADES = /^(quantity|price|previousPrice|total|totalCents|subtotalCents|delta|amount|value|cents)$/;
const ES_ID = /^(variant|product|item|order|orderId|payment|paymentId|target|entry|selected|created|pending)(\.[\w]+)*$/;

function idConversions(content, file) {
  const found = [];
  for (const match of content.matchAll(/Number\(\s*([\w.$\[\]'"]+)\s*\)/g)) {
    const expression = match[1].replace(/[[\]'"]/g, '');
    const last = expression.split('.').at(-1);
    if (CANTIDADES.test(last) || CANTIDADES.test(expression)) continue;
    if (ES_ID.test(expression)) found.push(`${file}: ${match[0]}`);
  }
  return found;
}

test('el identificador de variante viaja como texto, nunca como número', () => {
  const app = source('app.js');
  assert.equal(/addToCart\(Number\(/.test(app), false, 'no se debe pasar el id de variante como número');
  assert.equal(/Number\(variant\.id\)/.test(app), false, 'no se debe convertir variant.id a número');
  assert.match(app, /addToCart\(variant\.id\)/, 'se debe enviar el id tal cual lo entrega el catálogo');
});

test('los ids de línea del carrito se comparan normalizados a texto', () => {
  const app = source('app.js');
  assert.match(app, /String\(entry\.id\) === String\(target\.dataset\.itemId\)/, 'la comparación debe tolerar el tipo del servidor');
  assert.equal(/Number\(item\.id\)/.test(app), false, 'los ids de línea son texto');
});

test('ningún módulo convierte un identificador a número', () => {
  const offenders = ['app.js', 'store.js', 'views.js', 'product.js', 'ui.js', 'analytics.js', 'whatsapp.js']
    .flatMap((name) => idConversions(source(name), name));
  assert.deepEqual(offenders, [], `conversiones inválidas de id: ${offenders.join('; ')}`);
});

test('las cantidades sí se convierten a número', () => {
  // El control del test 3 no debe volverse demasiado restrictivo.
  const app = source('app.js');
  assert.match(app, /Number\(item\.quantity/, 'la cantidad del carrito se maneja como número');
  assert.match(app, /Number\(target\.dataset\.delta\)/, 'el incremento de cantidad se maneja como número');
});

test('store.js envía el id de variante sin transformar', () => {
  const store = source('store.js');
  assert.match(store, /inventoryVariantId: variantId/, 'el carrito envía el id tal como lo recibe');
  assert.equal(/Number\(variantId\)/.test(store), false);
});
