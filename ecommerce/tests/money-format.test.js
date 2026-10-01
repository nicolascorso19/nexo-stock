import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const views = fs.readFileSync(path.join(publicDir, 'js/views.js'), 'utf8');
const cart = fs.readFileSync(path.join(publicDir, 'js/store.js'), 'utf8');

/**
 * La cotización del carrito trabaja en centavos (`subtotalCents`,
 * `unitPrice`), mientras que los totales del pedido ya vienen en pesos
 * (`totals.total`, `lineTotal`). Mezclarlos muestra importes con dos decimales
 * de más: un iPhone de 1.699 aparece como 169.900.
 *
 * Estos tests fijan qué campos hay que convertir y cuáles no.
 */
test('los importes de la cotización se convierten de centavos a pesos', () => {
  // Cada línea del carrito y cada fila del resumen.
  const conversions = [...views.matchAll(/money\(([\w.[\]']+)\s*(\/\s*100)?\)/g)]
    .map((match) => ({ expression: match[1], divides: Boolean(match[2]) }));

  const centsFields = ['line.unitPrice', 'quote.subtotalCents', 'quote.discountCents', 'quote.shippingCents', 'quote.totalCents', 'shipping.flatCents', 'shipping.freeFromCents'];
  for (const field of centsFields) {
    const found = conversions.find((item) => item.expression === field);
    assert.ok(found, `debe renderizarse ${field}`);
    assert.equal(found.divides, true, `${field} viene en centavos y debe dividirse por 100`);
  }
});

test('los importes de pedido se usan tal cual, sin volver a dividir', () => {
  // orders.js ya expone totales y líneas en pesos.
  const conversions = [...views.matchAll(/money\(([\w.[\]']+)\s*(\/\s*100)?\)/g)]
    .map((match) => ({ expression: match[1], divides: Boolean(match[2]) }));

  for (const field of ['item.lineTotal', 'order.totals.total', 'line.unitPrice']) {
    if (field === 'line.unitPrice') continue;
    const found = conversions.find((item) => item.expression === field);
    if (found) assert.equal(found.divides, false, `${field} ya viene en pesos: dividirlo mostraría centavos de más`);
  }
});

test('el precio de catálogo se muestra en pesos sin conversión', () => {
  const product = fs.readFileSync(path.join(publicDir, 'js/ui.js'), 'utf8');
  assert.match(product, /money\(variant\.price\)/, 'el precio de la variante llega en pesos desde el catálogo');
  assert.match(product, /money\(variant\.previousPrice\)/, 'el precio anterior también');
});

test('el carrito del servidor se guarda en centavos y el cliente no los recalcula', () => {
  assert.match(cart, /inventoryVariantId: variantId/, 'el carrito sólo guarda identificadores y cantidad');
  assert.equal(/totalCents\s*[:=]\s*\d/.test(cart), false, 'el cliente no guarda totales propios');
});
